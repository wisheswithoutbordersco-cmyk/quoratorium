import { storagePut } from "./storage";

export type ImageAspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "2:3";
export type ImageQuality = "auto" | "low" | "medium" | "high";
export type ImageProvider = "openai" | "fal.ai";

export interface ImageProviderFailure {
  provider: ImageProvider;
  code: "unavailable" | "request_failed" | "invalid_response" | "storage_failed";
  message: string;
}

export interface GenerateImageOptions {
  aspectRatio?: ImageAspectRatio;
  size?: "1024x1024" | "1792x1024" | "1024x1792";
  quality?: ImageQuality;
}

export interface GenerateImageResult {
  success: boolean;
  imageUrl?: string;
  storageKey?: string;
  revisedPrompt?: string;
  provider?: ImageProvider;
  model?: string;
  fallbackUsed?: boolean;
  providerErrors?: ImageProviderFailure[];
  error?: string;
}

type StoredImage = { key: string; url: string };

export interface ImageGenerationDependencies {
  fetchImpl?: typeof fetch;
  storeImage?: (path: string, data: Buffer, contentType: string) => Promise<StoredImage>;
  openAiApiKey?: string;
  falApiKey?: string;
  openAiModel?: string;
}

const OPENAI_API_URL = "https://api.openai.com/v1/images/generations";
const FAL_API_URL = "https://fal.run/fal-ai/flux-pro/v1.1-ultra";
const DEFAULT_OPENAI_IMAGE_MODEL = "gpt-image-2";

function sanitizeProviderMessage(value: unknown): string {
  const raw = value instanceof Error ? value.message : String(value || "Unknown provider error");
  return raw
    .replace(/\bBearer\s+[A-Za-z0-9._-]{8,}/gi, "Bearer [redacted]")
    .replace(/\bKey\s+[A-Za-z0-9._-]{8,}/gi, "Key [redacted]")
    .slice(0, 500);
}

function resolveAspectRatio(options: GenerateImageOptions): ImageAspectRatio {
  if (options.aspectRatio) return options.aspectRatio;
  if (options.size === "1792x1024") return "16:9";
  if (options.size === "1024x1792") return "9:16";
  return "1:1";
}

function toOpenAiSize(aspectRatio: ImageAspectRatio): "1024x1024" | "1536x1024" | "1024x1536" {
  if (aspectRatio === "16:9" || aspectRatio === "4:3") return "1536x1024";
  if (aspectRatio === "9:16" || aspectRatio === "2:3") return "1024x1536";
  return "1024x1024";
}

function providerFailure(
  provider: ImageProvider,
  code: ImageProviderFailure["code"],
  message: unknown,
): ImageProviderFailure {
  return { provider, code, message: sanitizeProviderMessage(message) };
}

async function storeGeneratedImage(
  base64Data: string,
  prompt: string,
  storeImage: NonNullable<ImageGenerationDependencies["storeImage"]>,
): Promise<StoredImage> {
  const slug = prompt.slice(0, 36).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "image";
  return storeImage(`generated-images/${Date.now()}-${slug}.png`, Buffer.from(base64Data, "base64"), "image/png");
}

/**
 * Generate directly with OpenAI first. fal.ai is attempted only when OpenAI is
 * unavailable or its request/response/storage path fails.
 */
export async function generateImageWithFallback(
  prompt: string,
  options: GenerateImageOptions = {},
  dependencies: ImageGenerationDependencies = {},
): Promise<GenerateImageResult> {
  const normalizedPrompt = prompt.trim();
  if (!normalizedPrompt) {
    return { success: false, error: "Prompt is required", providerErrors: [] };
  }

  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const storeImage = dependencies.storeImage ?? storagePut;
  const openAiApiKey = dependencies.openAiApiKey ?? process.env.OPENAI_API_KEY;
  const falApiKey = dependencies.falApiKey ?? process.env.FAL_API_KEY;
  const openAiModel = dependencies.openAiModel ?? process.env.OPENAI_IMAGE_MODEL ?? DEFAULT_OPENAI_IMAGE_MODEL;
  const aspectRatio = resolveAspectRatio(options);
  const providerErrors: ImageProviderFailure[] = [];

  if (!openAiApiKey) {
    providerErrors.push(providerFailure("openai", "unavailable", "OPENAI_API_KEY is not configured"));
  } else {
    try {
      const response = await fetchImpl(OPENAI_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openAiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: openAiModel,
          prompt: normalizedPrompt,
          n: 1,
          size: toOpenAiSize(aspectRatio),
          quality: options.quality === "auto" ? "medium" : options.quality ?? "medium",
          output_format: "png",
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => response.statusText);
        throw new Error(`OpenAI Images API returned ${response.status}: ${detail}`);
      }

      const data = await response.json() as {
        data?: Array<{ b64_json?: string; revised_prompt?: string }>;
      };
      const image = data.data?.[0];
      if (!image?.b64_json) {
        providerErrors.push(providerFailure("openai", "invalid_response", "OpenAI returned no base64 image data"));
      } else {
        try {
          const stored = await storeGeneratedImage(image.b64_json, normalizedPrompt, storeImage);
          return {
            success: true,
            imageUrl: stored.url,
            storageKey: stored.key,
            revisedPrompt: image.revised_prompt || normalizedPrompt,
            provider: "openai",
            model: openAiModel,
            fallbackUsed: false,
            providerErrors,
          };
        } catch (storageError) {
          providerErrors.push(providerFailure("openai", "storage_failed", storageError));
        }
      }
    } catch (openAiError) {
      providerErrors.push(providerFailure("openai", "request_failed", openAiError));
    }
  }

  if (!falApiKey) {
    providerErrors.push(providerFailure("fal.ai", "unavailable", "FAL_API_KEY is not configured"));
  } else {
    try {
      const response = await fetchImpl(FAL_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Key ${falApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: normalizedPrompt,
          aspect_ratio: aspectRatio,
          output_format: "png",
          safety_tolerance: "5",
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => response.statusText);
        throw new Error(`fal.ai returned ${response.status}: ${detail}`);
      }

      const data = await response.json() as { images?: Array<{ url?: string }> };
      const imageUrl = data.images?.[0]?.url;
      if (!imageUrl) {
        providerErrors.push(providerFailure("fal.ai", "invalid_response", "fal.ai returned no image URL"));
      } else {
        return {
          success: true,
          imageUrl,
          revisedPrompt: normalizedPrompt,
          provider: "fal.ai",
          model: "fal-ai/flux-pro/v1.1-ultra",
          fallbackUsed: true,
          providerErrors,
        };
      }
    } catch (falError) {
      providerErrors.push(providerFailure("fal.ai", "request_failed", falError));
    }
  }

  return {
    success: false,
    error: "OpenAI image generation failed and the fal.ai fallback was unavailable or unsuccessful",
    providerErrors,
  };
}
