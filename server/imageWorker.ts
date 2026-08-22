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
  const lower = message.toLowerCase();
  const imageKeywords = [
    "generate an image",
    "create an image",
    "make an image",
    "draw",
    "illustrate",
    "design a logo",
    "create a logo",
    "make a logo",
    "generate a picture",
    "create artwork",
    "make art",
    "generate art",
    "create a visual",
    "dall-e",
    "dalle",
    "image of",
    "picture of",
    "illustration of",
    "generate a banner",
    "create a banner",
    "design a",
    "create a mockup",
    "generate a thumbnail",
  ];
  return imageKeywords.some(kw => lower.includes(kw));
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
