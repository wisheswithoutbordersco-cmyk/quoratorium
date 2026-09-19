import { TRPCError } from "@trpc/server";
import type OpenAI from "openai";
import { recyclatoriumAnalysisInputSchema, recyclatoriumPlanSchema } from "@shared/recyclatorium";
import { invokeLLM, type MessageContent } from "../_core/llm";
import { protectedProcedure, router } from "../_core/trpc";
import { callModel, MODELS } from "../model-router";

export const RECYCLATORIUM_ANALYSIS_MODEL = "gemini-3-flash-preview";
export const RECYCLATORIUM_FALLBACK_MODEL = MODELS.FAST;

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
          required: ["title", "instructions", "objective", "sourceAsset", "vocabulary", "prompt", "extension"],
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
        required: ["shortDescription", "longDescription", "tags", "suggestedPrice"],
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

function systemPrompt(mode: "recombine" | "transform" | "invent") {
  const modeInstruction = {
    recombine: "Use the strongest shared visual or educational thread to create one coherent activity pack.",
    transform: "Transform the source material into a distinctly different, more useful printable activity format.",
    invent: "Invent a fresh product concept inspired by the source assets rather than merely arranging them.",
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
- Return only JSON matching the supplied schema.`;
}

function getMessageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map(part => (part && typeof part === "object" && "text" in part ? String((part as { text: unknown }).text) : ""))
    .join("\n");
}

export function parseRecyclatoriumPlan(raw: string) {
  const normalized = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    throw new Error("The vision model returned malformed JSON.");
  }
  return recyclatoriumPlanSchema.parse(parsed);
}

async function analyzeWithForge(
  mode: "recombine" | "transform" | "invent",
  assets: Array<{ name: string; mimeType: string; dataUrl: string }>,
) {
  const content: MessageContent[] = [
    {
      type: "text",
      text: `Asset names, in upload order: ${assets.map(asset => asset.name).join(", ")}`,
    },
    ...assets.map(asset => asset.mimeType === "application/pdf"
      ? ({ type: "file_url", file_url: { url: asset.dataUrl, mime_type: "application/pdf" } } as const)
      : ({ type: "image_url", image_url: { url: asset.dataUrl, detail: "high" } } as const)),
  ];

  const result = await invokeLLM({
    model: RECYCLATORIUM_ANALYSIS_MODEL,
    messages: [
      { role: "system", content: systemPrompt(mode) },
      { role: "user", content },
    ],
    response_format: {
      type: "json_schema",
      json_schema: productPlanJsonSchema,
    },
    max_tokens: 6000,
    temperature: 0.2,
  });

  return parseRecyclatoriumPlan(getMessageText(result.choices[0]?.message?.content));
}

async function analyzeWithOpenRouter(
  mode: "recombine" | "transform" | "invent",
  assets: Array<{ name: string; mimeType: string; dataUrl: string }>,
) {
  const imageAssets = assets.filter(asset => asset.mimeType.startsWith("image/"));
  if (imageAssets.length === 0) {
    throw new Error("The backup vision provider cannot inspect PDF-only uploads.");
  }

  const content: OpenAI.ChatCompletionContentPart[] = [
    {
      type: "text",
      text: `${systemPrompt(mode)}\n\nAsset names, in upload order: ${assets.map(asset => asset.name).join(", ")}`,
    },
    ...imageAssets.map(asset => ({
      type: "image_url" as const,
      image_url: { url: asset.dataUrl, detail: "high" as const },
    })),
  ];

  const raw = await callModel(
    RECYCLATORIUM_FALLBACK_MODEL,
    [{ role: "user", content }],
    { temperature: 0.2, maxTokens: 6000 },
  );
  return parseRecyclatoriumPlan(raw);
}

export const recyclatoriumRouter = router({
  analyze: protectedProcedure
    .input(recyclatoriumAnalysisInputSchema)
    .mutation(async ({ input }) => {
      try {
        const plan = await analyzeWithForge(input.mode, input.assets);
        return { plan, model: RECYCLATORIUM_ANALYSIS_MODEL, fallbackUsed: false };
      } catch (primaryError) {
        console.warn("[Recyclatorium] Forge analysis failed; trying OpenRouter vision", primaryError);
        try {
          const plan = await analyzeWithOpenRouter(input.mode, input.assets);
          return { plan, model: RECYCLATORIUM_FALLBACK_MODEL, fallbackUsed: true };
        } catch (fallbackError) {
          console.error("[Recyclatorium] All visual analysis providers failed", fallbackError);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Visual analysis is unavailable. Nothing was generated from filenames; please try again.",
          });
        }
      }
    }),
});
