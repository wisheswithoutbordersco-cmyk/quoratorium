/**
 * Image Generation Worker — OpenAI primary, fal.ai reliability fallback.
 */
import { generateImageWithFallback } from "./imageGenerationService";

export interface ImageGenerationResult {
  success: boolean;
  imageUrl?: string; // Storage URL for display
  storageKey?: string; // Key for R2/S3 storage
  revisedPrompt?: string;
  provider?: "openai" | "fal.ai";
  fallbackUsed?: boolean;
  error?: string;
}

/**
 * Generate an image with OpenAI first and fal.ai only as fallback.
 */
export async function generateImage(
  prompt: string,
  options: {
    size?: "1024x1024" | "1792x1024" | "1024x1792";
    quality?: "auto" | "low" | "medium" | "high";
    style?: "vivid" | "natural";
  } = {}
): Promise<ImageGenerationResult> {
  const result = await generateImageWithFallback(prompt, {
    size: options.size,
    quality: options.quality,
  });

  return {
    success: result.success,
    imageUrl: result.imageUrl,
    storageKey: result.storageKey,
    revisedPrompt: result.revisedPrompt,
    provider: result.provider,
    fallbackUsed: result.fallbackUsed,
    error: result.error,
  };
}

/**
 * Detect if a message is an image generation request
 */
export function isImageRequest(message: string): boolean {
  const normalized = message.toLowerCase().replace(/\s+/g, " ").trim();

  // Talking about image generation is not the same as asking Q to generate.
  // These phrases cover the reported false positive as well as common follow-ups.
  const nonGenerationContexts = [
    /\b(?:without|not|don't|do not|didn't|did not|isn't|is not|wasn't|was not|stop|avoid)\b[^.!?]{0,80}\b(?:generate|create|make|draw|design|illustrate)(?:d|s|ing)?\b[^.!?]{0,40}\b(?:image|picture|art|artwork|visual|logo|banner|mockup|thumbnail)\b/i,
    /\b(?:can|could|do) you (?:see|view|read|analy[sz]e|describe|inspect|look at)\b[^.!?]{0,80}\b(?:image|picture|photo|file|attachment|upload)\b/i,
    /\b(?:prompt|instructions?)\b[^.!?]{0,80}\b(?:generator|image generator)\b/i,
  ];
  if (nonGenerationContexts.some((pattern) => pattern.test(normalized))) return false;

  const explicitImageRequests = [
    /\b(?:generate|create|make)\s+(?:me\s+)?(?:an?\s+)?(?:image|picture|artwork|illustration|visual|logo|banner|mockup|thumbnail)\b/i,
    /\b(?:draw|illustrate)\s+(?:me\s+)?(?:an?\s+)?/i,
    /\b(?:image|picture|illustration|poster|logo|banner|thumbnail)\s+of\b/i,
    /\b(?:dall-e|dalle)\b/i,
  ];

  return explicitImageRequests.some((pattern) => pattern.test(normalized));
}

/**
 * Extract the image prompt from a user message
 */
export function extractImagePrompt(message: string): string {
  // Remove common prefixes
  let prompt = message
    .replace(/^(please\s+)?(can you\s+)?(generate|create|make|draw|illustrate|design)\s+(an?\s+)?(image|picture|logo|art|artwork|illustration|visual|banner|mockup|thumbnail)\s*(of|for|that|showing|depicting|with)?\s*/i, "")
    .trim();

  // If nothing left after stripping, use the original message
  if (prompt.length < 5) {
    prompt = message;
  }

  return prompt;
}
