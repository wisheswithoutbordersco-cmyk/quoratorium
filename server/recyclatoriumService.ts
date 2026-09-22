import type OpenAI from "openai";
import type {
  RecyclatoriumAnalysisInput,
  RecyclatoriumPlan,
} from "@shared/recyclatorium";
import {
  recyclatoriumAnalysisInputSchema,
  recyclatoriumPlanSchema,
} from "@shared/recyclatorium";
import { invokeLLM, type MessageContent } from "./_core/llm";
import { addOrchestrationEvent } from "./db";
import { callModel, MODELS } from "./model-router";

export const RECYCLATORIUM_ANALYSIS_MODEL = "gemini-3-flash-preview";
export const RECYCLATORIUM_FALLBACK_MODEL = MODELS.FAST;
export const RECYCLATORIUM_RATE_LIMIT = 6;
export const RECYCLATORIUM_RATE_WINDOW_MS = 15 * 60 * 1000;
export const RECYCLATORIUM_MAX_ASSET_BYTES = 7_500_000;
export const RECYCLATORIUM_MAX_TOTAL_BYTES = 20_000_000;

const SUPPORTED_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

const usageWindows = new Map<number, number[]>();

const productPlanJsonSchema = {
  name: "recyclatorium_product_plan",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string" },
      subtitle: { type: "string" },
      theme: { type: "string" },
      ageGrade: { type: "string" },
      productType: { type: "string" },
      customer: { type: "string" },
      visualSummary: { type: "string" },
      whyTogether: { type: "string" },
      teachingGoals: {
        type: "array",
        minItems: 3,
        maxItems: 6,
        items: { type: "string" },
      },
      palette: {
        type: "array",
        minItems: 3,
        maxItems: 6,
        items: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
      },
      activities: {
        type: "array",
        minItems: 4,
        maxItems: 6,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            instructions: { type: "string" },
            objective: { type: "string" },
            sourceAsset: { type: "string" },
            vocabulary: {
              type: "array",
              minItems: 2,
              maxItems: 6,
              items: { type: "string" },
            },
            prompt: { type: "string" },
            extension: { type: "string" },
          },
          required: [
            "title",
            "instructions",
            "objective",
            "sourceAsset",
            "vocabulary",
            "prompt",
            "extension",
          ],
        },
      },
      listing: {
        type: "object",
        additionalProperties: false,
        properties: {
          shortDescription: { type: "string" },
          longDescription: { type: "string" },
          tags: {
            type: "array",
            minItems: 5,
            maxItems: 13,
            items: { type: "string" },
          },
          suggestedPrice: { type: "string" },
        },
        required: [
          "shortDescription",
          "longDescription",
          "tags",
          "suggestedPrice",
        ],
      },
    },
    required: [
      "title",
      "subtitle",
      "theme",
      "ageGrade",
      "productType",
      "customer",
      "visualSummary",
      "whyTogether",
      "teachingGoals",
      "palette",
      "activities",
      "listing",
    ],
  },
} as const;

export class RecyclatoriumInputError extends Error {}
export class RecyclatoriumRateLimitError extends Error {}

function systemPrompt(
  mode: RecyclatoriumAnalysisInput["mode"],
  instructions?: string
) {
  const modeInstruction = {
    recombine:
      "Use the strongest shared visual or educational thread to create one coherent activity pack.",
    transform:
      "Transform the source material into a distinctly different, more useful printable activity format.",
    invent:
      "Invent a fresh product concept inspired by the source assets rather than merely arranging them.",
  }[mode];

  return `You are an expert K-6 curriculum designer and visual product editor. ${modeInstruction}

Actually inspect every provided asset. Do not infer from filenames. Return a plan for a NEW printable product, not a list of the uploads and not a promise to make one later.

Requirements:
- Create 4-6 concrete, age-appropriate worksheet or activity pages with instructions, prompts, vocabulary, and extensions.
- Each activity must materially transform the source into a learning task; never make an activity that merely says to look at the uploaded page.
- The sourceAsset field must exactly match one supplied asset name so the renderer can place a supporting thumbnail.
- Use all source assets across the activity set when they are relevant.
- Choose a cheerful printable palette with valid six-digit hex colors. Avoid black or near-black page backgrounds.
- Keep claims grounded in what is visibly present. Do not invent author, publisher, or licensing claims.
- Make text concise enough for an 8.5x11 classroom handout.
${instructions?.trim() ? `- Follow this owner direction when it does not conflict with the requirements: ${instructions.trim().slice(0, 1200)}` : ""}
- Return only JSON matching the supplied schema.`;
}

function getMessageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map(part =>
      part && typeof part === "object" && "text" in part
        ? String((part as { text: unknown }).text)
        : ""
    )
    .join("\n");
}

export function parseRecyclatoriumPlan(raw: string): RecyclatoriumPlan {
  const normalized = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    throw new Error("The vision model returned malformed JSON.");
  }
  return recyclatoriumPlanSchema.parse(parsed);
}

function hasExpectedSignature(mimeType: string, bytes: Buffer): boolean {
  if (mimeType === "image/jpeg")
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  if (mimeType === "image/png")
    return bytes
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === "image/webp")
    return (
      bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP"
    );
  if (mimeType === "image/gif")
    return ["GIF87a", "GIF89a"].includes(
      bytes.subarray(0, 6).toString("ascii")
    );
  if (mimeType === "application/pdf")
    return bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  return false;
}

export function validateRecyclatoriumAssets(
  input: RecyclatoriumAnalysisInput
): RecyclatoriumAnalysisInput {
  const parsed = recyclatoriumAnalysisInputSchema.parse(input);
  let totalBytes = 0;

  const assets = parsed.assets.map((asset, index) => {
    const mimeType = asset.mimeType.trim().toLowerCase();
    if (!SUPPORTED_MEDIA_TYPES.has(mimeType)) {
      throw new RecyclatoriumInputError(
        `Asset ${index + 1} uses unsupported media type ${mimeType}.`
      );
    }

    const match = asset.dataUrl.match(
      /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/
    );
    if (!match || match[1].toLowerCase() !== mimeType) {
      throw new RecyclatoriumInputError(
        `Asset ${index + 1} is not a valid ${mimeType} data URL.`
      );
    }

    const encoded = match[2];
    if (encoded.length % 4 !== 0) {
      throw new RecyclatoriumInputError(
        `Asset ${index + 1} has invalid base64 encoding.`
      );
    }
    const bytes = Buffer.from(encoded, "base64");
    if (
      bytes.byteLength === 0 ||
      bytes.byteLength > RECYCLATORIUM_MAX_ASSET_BYTES
    ) {
      throw new RecyclatoriumInputError(
        `Asset ${index + 1} must be between 1 byte and ${Math.floor(RECYCLATORIUM_MAX_ASSET_BYTES / 1_000_000)} MB.`
      );
    }
    if (!hasExpectedSignature(mimeType, bytes)) {
      throw new RecyclatoriumInputError(
        `Asset ${index + 1} content does not match ${mimeType}.`
      );
    }

    totalBytes += bytes.byteLength;
    if (totalBytes > RECYCLATORIUM_MAX_TOTAL_BYTES) {
      throw new RecyclatoriumInputError(
        "Combined Recyclatorium assets must stay under 20 MB."
      );
    }

    return {
      name: asset.name.trim(),
      mimeType,
      dataUrl: `data:${mimeType};base64,${encoded}`,
    };
  });

  return { ...parsed, assets };
}

export function enforceRecyclatoriumRateLimit(
  userId: number,
  now = Date.now()
): void {
  const recent = (usageWindows.get(userId) || []).filter(
    timestamp => now - timestamp < RECYCLATORIUM_RATE_WINDOW_MS
  );
  if (recent.length >= RECYCLATORIUM_RATE_LIMIT) {
    throw new RecyclatoriumRateLimitError(
      "Recyclatorium is limited to six analyses every fifteen minutes."
    );
  }
  recent.push(now);
  usageWindows.set(userId, recent);
}

export function resetRecyclatoriumRateLimitsForTests(): void {
  usageWindows.clear();
}

async function analyzeWithForge(
  mode: RecyclatoriumAnalysisInput["mode"],
  assets: RecyclatoriumAnalysisInput["assets"],
  instructions?: string
) {
  const content: MessageContent[] = [
    {
      type: "text",
      text: `Asset names, in upload order: ${assets.map(asset => asset.name).join(", ")}`,
    },
    ...assets.map(asset =>
      asset.mimeType === "application/pdf"
        ? ({
            type: "file_url",
            file_url: { url: asset.dataUrl, mime_type: "application/pdf" },
          } as const)
        : ({
            type: "image_url",
            image_url: { url: asset.dataUrl, detail: "high" },
          } as const)
    ),
  ];

  const result = await invokeLLM({
    model: RECYCLATORIUM_ANALYSIS_MODEL,
    messages: [
      { role: "system", content: systemPrompt(mode, instructions) },
      { role: "user", content },
    ],
    response_format: {
      type: "json_schema",
      json_schema: productPlanJsonSchema,
    },
    max_tokens: 6000,
    temperature: 0.2,
  });

  return parseRecyclatoriumPlan(
    getMessageText(result.choices[0]?.message?.content)
  );
}

async function analyzeWithOpenRouter(
  mode: RecyclatoriumAnalysisInput["mode"],
  assets: RecyclatoriumAnalysisInput["assets"],
  instructions?: string
) {
  const imageAssets = assets.filter(asset =>
    asset.mimeType.startsWith("image/")
  );
  if (imageAssets.length === 0) {
    throw new Error(
      "The backup vision provider cannot inspect PDF-only uploads."
    );
  }

  const content: OpenAI.ChatCompletionContentPart[] = [
    {
      type: "text",
      text: `${systemPrompt(mode, instructions)}\n\nAsset names, in upload order: ${assets.map(asset => asset.name).join(", ")}`,
    },
    ...imageAssets.map(asset => ({
      type: "image_url" as const,
      image_url: { url: asset.dataUrl, detail: "high" as const },
    })),
  ];

  const raw = await callModel(
    RECYCLATORIUM_FALLBACK_MODEL,
    [{ role: "user", content }],
    { temperature: 0.2, maxTokens: 6000 }
  );
  return parseRecyclatoriumPlan(raw);
}

async function recordAudit(input: {
  userId: number;
  projectId?: number | null;
  outcome: "completed" | "failed";
  mode: RecyclatoriumAnalysisInput["mode"];
  assetNames: string[];
  fallbackUsed?: boolean;
  plan?: RecyclatoriumPlan;
  error?: string;
}) {
  try {
    await addOrchestrationEvent({
      user_id: input.userId,
      project_id: input.projectId ?? null,
      event_type:
        input.outcome === "completed"
          ? "recyclatorium_plan_proposed"
          : "recyclatorium_plan_failed",
      agent_name: "Toríu · Recyclatorium",
      summary:
        input.outcome === "completed"
          ? `Proposed ${input.plan?.title || "a Recyclatorium plan"}`
          : `Recyclatorium analysis failed: ${(input.error || "Unknown error").slice(0, 160)}`,
      payload: {
        capability: "recyclatorium.product_plan.propose",
        permission: "propose",
        risk: "medium",
        confirmation: "review_then_confirm",
        mode: input.mode,
        assetNames: input.assetNames,
        fallbackUsed: input.fallbackUsed ?? false,
        activityCount: input.plan?.activities.length,
        outcome: input.outcome,
      },
    });
  } catch (error) {
    console.warn("[Recyclatorium] Failed to record audit event", error);
  }
}

export async function analyzeRecyclatoriumAssets(input: {
  userId: number;
  projectId?: number | null;
  mode: RecyclatoriumAnalysisInput["mode"];
  assets: RecyclatoriumAnalysisInput["assets"];
  instructions?: string;
}): Promise<{ plan: RecyclatoriumPlan; model: string; fallbackUsed: boolean }> {
  const validated = validateRecyclatoriumAssets({
    mode: input.mode,
    assets: input.assets,
  });
  enforceRecyclatoriumRateLimit(input.userId);

  try {
    const plan = await analyzeWithForge(
      validated.mode,
      validated.assets,
      input.instructions
    );
    await recordAudit({
      userId: input.userId,
      projectId: input.projectId,
      outcome: "completed",
      mode: validated.mode,
      assetNames: validated.assets.map(asset => asset.name),
      plan,
      fallbackUsed: false,
    });
    return { plan, model: RECYCLATORIUM_ANALYSIS_MODEL, fallbackUsed: false };
  } catch (primaryError) {
    console.warn(
      "[Recyclatorium] Forge analysis failed; trying OpenRouter vision",
      primaryError
    );
    try {
      const plan = await analyzeWithOpenRouter(
        validated.mode,
        validated.assets,
        input.instructions
      );
      await recordAudit({
        userId: input.userId,
        projectId: input.projectId,
        outcome: "completed",
        mode: validated.mode,
        assetNames: validated.assets.map(asset => asset.name),
        plan,
        fallbackUsed: true,
      });
      return { plan, model: RECYCLATORIUM_FALLBACK_MODEL, fallbackUsed: true };
    } catch (fallbackError) {
      const message =
        fallbackError instanceof Error
          ? fallbackError.message
          : "All visual analysis providers failed.";
      await recordAudit({
        userId: input.userId,
        projectId: input.projectId,
        outcome: "failed",
        mode: validated.mode,
        assetNames: validated.assets.map(asset => asset.name),
        error: message,
      });
      console.error(
        "[Recyclatorium] All visual analysis providers failed",
        fallbackError
      );
      throw new Error(
        "Visual analysis is unavailable. Nothing was generated from filenames; please try again."
      );
    }
  }
}
