/**
 * Tool: scriptorium_generate
 * Generate a premium-quality image through Scriptorium's composition layer.
 */
import { registerTool, type ToolContext, type ToolResult } from "./index";

const GENERATION_TIMEOUT_MS = 5 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isImageUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function findImageUrl(value: unknown): string | undefined {
  if (isImageUrl(value)) return value;

  if (Array.isArray(value)) {
    for (const item of value) {
      const imageUrl = findImageUrl(item);
      if (imageUrl) return imageUrl;
    }
    return undefined;
  }

  if (!isRecord(value)) return undefined;

  const directKeys = [
    "imageUrl",
    "image_url",
    "url",
    "outputUrl",
    "output_url",
    "resultUrl",
    "result_url",
  ];

  for (const key of directKeys) {
    if (isImageUrl(value[key])) return value[key];
  }

  for (const key of ["image", "output", "result", "data", "images", "pages"]) {
    const imageUrl = findImageUrl(value[key]);
    if (imageUrl) return imageUrl;
  }

  return undefined;
}

function extractImageUrl(responseBody: string): string | undefined {
  const trimmedBody = responseBody.trim();
  if (!trimmedBody) return undefined;

  try {
    const imageUrl = findImageUrl(JSON.parse(trimmedBody));
    if (imageUrl) return imageUrl;
  } catch {
    // The quick-create endpoint streams Server-Sent Events, so the full body may not be JSON.
  }

  let finalImageUrl: string | undefined;
  for (const event of trimmedBody.split(/\r?\n\r?\n/)) {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");

    if (!data || data === "[DONE]") continue;

    try {
      const imageUrl = findImageUrl(JSON.parse(data));
      if (imageUrl) finalImageUrl = imageUrl;
    } catch {
      if (isImageUrl(data)) finalImageUrl = data;
    }
  }

  return finalImageUrl;
}

function responseErrorDetail(responseBody: string): string {
  try {
    const parsed = JSON.parse(responseBody) as Record<string, unknown>;
    const detail = parsed.error ?? parsed.message ?? parsed.details;
    if (typeof detail === "string" && detail.trim()) return detail.trim();
  } catch {
    // Use the plain-text response below when the error body is not JSON.
  }

  return responseBody.trim().slice(0, 500) || "No error details returned.";
}

registerTool({
  name: "scriptorium_generate",
  description:
    "Generate a high-quality AI image using Scriptorium's composition layer. Use this for premium quality images.",
  parameters: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "The complete image-generation prompt to send to Scriptorium.",
      },
    },
    required: ["prompt"],
    additionalProperties: false,
  },
  async execute(args: Record<string, any>, _context: ToolContext): Promise<ToolResult> {
    const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
    if (!prompt) {
      return { success: false, output: "Missing image-generation prompt." };
    }

    const studioUrl = process.env.PRODUCTION_STUDIO_URL?.replace(/\/+$/, "");
    if (!studioUrl) {
      return {
        success: false,
        output: "Scriptorium is not configured. Set the PRODUCTION_STUDIO_URL environment variable.",
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);

    try {
      const response = await fetch(`${studioUrl}/api/quick-create/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream, application/json",
        },
        body: JSON.stringify({
          prompt,
          pages: 1,
          style: "full-color",
          size: "1024x1024",
          upscale: false,
        }),
        signal: controller.signal,
      });
      const responseBody = await response.text();

      if (!response.ok) {
        return {
          success: false,
          output: `Scriptorium generation failed (${response.status}): ${responseErrorDetail(responseBody)}`,
        };
      }

      const imageUrl = extractImageUrl(responseBody);
      if (!imageUrl) {
        return {
          success: false,
          output: "Scriptorium completed without returning a final image URL.",
        };
      }

      return {
        success: true,
        output: `Scriptorium generated the image: ${imageUrl}`,
        data: { imageUrl, provider: "scriptorium" },
        artifacts: [
          {
            type: "image",
            name: "Scriptorium generated image",
            url: imageUrl,
          },
        ],
      };
    } catch (err: any) {
      const isTimeout = err?.name === "AbortError";
      return {
        success: false,
        output: isTimeout
          ? "Scriptorium generation timed out while waiting for the final image."
          : `Scriptorium generation error: ${err?.message || "Unknown error"}`,
      };
    } finally {
      clearTimeout(timeout);
    }
  },
});
