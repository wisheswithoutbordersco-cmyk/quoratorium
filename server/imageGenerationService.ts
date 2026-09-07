import { generateImage as generateBuiltInImage } from "./_core/imageGeneration";
import { storagePut } from "./storage";

export type ImageAspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "2:3";
export type ImageQuality = "auto" | "low" | "medium" | "high";
export type ImageProvider = "built-in" | "fal.ai";

export interface ImageReference {
  url?: string;
  b64Json?: string;
  mimeType?: string;
}

export interface ImageProviderFailure {
  provider: ImageProvider;
  code: "unavailable" | "request_failed" | "invalid_response" | "storage_failed";
  message: string;
}

export interface GenerateImageOptions {
  aspectRatio?: ImageAspectRatio;
  size?: "1024x1024" | "1792x1024" | "1024x1792";
  quality?: ImageQuality;
  originalImages?: ImageReference[];
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
type BuiltInGenerator = (options: {
  prompt: string;
  originalImages?: ImageReference[];
}) => Promise<{ url?: string }>;

export interface ImageGenerationDependencies {
  fetchImpl?: typeof fetch;
  storeImage?: (path: string, data: Buffer, contentType: string) => Promise<StoredImage>;
  generateBuiltIn?: BuiltInGenerator;
  falApiKey?: string;
}

const FAL_TEXT_API_URL = "https://fal.run/openai/gpt-image-2";
const FAL_EDIT_API_URL = "https://fal.run/openai/gpt-image-2/edit";
const BUILT_IN_MODEL = "gpt-image-2";
const FAL_TEXT_MODEL = "openai/gpt-image-2";
const FAL_EDIT_MODEL = "openai/gpt-image-2/edit";

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

function toFalImageSize(aspectRatio: ImageAspectRatio): string {
  if (aspectRatio === "16:9") return "landscape_16_9";
  if (aspectRatio === "4:3") return "landscape_4_3";
  if (aspectRatio === "9:16") return "portrait_16_9";
  if (aspectRatio === "2:3") return "portrait_4_3";
  return "square_hd";
}

function toFalReferenceUrl(reference: ImageReference): string | null {
  if (reference.url) return reference.url;
  if (reference.b64Json) {
    return `data:${reference.mimeType || "image/png"};base64,${reference.b64Json}`;
  }
  return null;
}

function providerFailure(
  provider: ImageProvider,
  code: ImageProviderFailure["code"],
  message: unknown,
): ImageProviderFailure {
  return { provider, code, message: sanitizeProviderMessage(message) };
}

function generatedPath(prompt: string, extension = "png"): string {
  const slug = prompt.slice(0, 36).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "image";
  return `generated-images/${Date.now()}-${slug}.${extension}`;
}

function mimeExtension(contentType: string): string {
  if (contentType.includes("jpeg")) return "jpg";
  if (contentType.includes("webp")) return "webp";
  return "png";
}

async function storeRemoteImage(
  imageUrl: string,
  prompt: string,
  fetchImpl: typeof fetch,
  storeImage: NonNullable<ImageGenerationDependencies["storeImage"]>,
): Promise<StoredImage> {
  const response = await fetchImpl(imageUrl, { headers: { Accept: "image/*" } });
  if (!response.ok) {
    throw new Error(`Generated image download failed (${response.status})`);
  }

  const contentType = response.headers?.get?.("content-type") || "image/png";
  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new Error(`Generated image download returned ${contentType}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error("Generated image download was empty");

  return storeImage(generatedPath(prompt, mimeExtension(contentType)), bytes, contentType);
}

/**
 * Generate with Q's preconfigured built-in GPT Image service first. fal.ai is
 * attempted exactly once only when the primary request fails. Every successful
 * result must be a durable stored URL before it is returned to the chat.
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
  const generateBuiltIn = dependencies.generateBuiltIn ?? generateBuiltInImage;
  const falApiKey = dependencies.falApiKey ?? process.env.FAL_API_KEY;
  const aspectRatio = resolveAspectRatio(options);
  const providerErrors: ImageProviderFailure[] = [];

  try {
    const result = await generateBuiltIn({
      prompt: normalizedPrompt,
      originalImages: options.originalImages,
    });
    if (!result.url) {
      providerErrors.push(providerFailure("built-in", "invalid_response", "Built-in image service returned no image URL"));
    } else {
      return {
        success: true,
        imageUrl: result.url,
        revisedPrompt: normalizedPrompt,
        provider: "built-in",
        model: BUILT_IN_MODEL,
        fallbackUsed: false,
        providerErrors,
      };
    }
  } catch (error) {
    const message = sanitizeProviderMessage(error);
    const code = /not configured/i.test(message) ? "unavailable" : "request_failed";
    providerErrors.push(providerFailure("built-in", code, message));
  }

  if (!falApiKey) {
    providerErrors.push(providerFailure("fal.ai", "unavailable", "FAL_API_KEY is not configured"));
  } else {
    try {
      const referenceUrls = (options.originalImages || [])
        .map(toFalReferenceUrl)
        .filter((value): value is string => Boolean(value))
        .slice(0, 16);
      const falApiUrl = referenceUrls.length > 0 ? FAL_EDIT_API_URL : FAL_TEXT_API_URL;
      const response = await fetchImpl(falApiUrl, {
        method: "POST",
        headers: {
          Authorization: `Key ${falApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: normalizedPrompt,
          ...(referenceUrls.length > 0 ? { image_urls: referenceUrls } : {}),
          image_size: referenceUrls.length > 0 ? "auto" : toFalImageSize(aspectRatio),
          quality: options.quality === "auto" ? "high" : options.quality ?? "high",
          num_images: 1,
          output_format: "png",
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
        try {
          const stored = await storeRemoteImage(imageUrl, normalizedPrompt, fetchImpl, storeImage);
          return {
            success: true,
            imageUrl: stored.url,
            storageKey: stored.key,
            revisedPrompt: normalizedPrompt,
            provider: "fal.ai",
            model: referenceUrls.length > 0 ? FAL_EDIT_MODEL : FAL_TEXT_MODEL,
            fallbackUsed: true,
            providerErrors,
          };
        } catch (storageError) {
          providerErrors.push(providerFailure("fal.ai", "storage_failed", storageError));
        }
      }
    } catch (error) {
      providerErrors.push(providerFailure("fal.ai", "request_failed", error));
    }
  }

  return {
    success: false,
    error: "Image generation failed. The primary image service and its single backup were unavailable or unsuccessful.",
    providerErrors,
  };
}
