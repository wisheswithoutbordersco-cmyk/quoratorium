/**
 * Image Generation Worker — preconfigured GPT Image primary, one fal.ai fallback.
 */
import {
  generateImageWithFallback,
  type ImageReference,
} from "./imageGenerationService";

export interface ImageGenerationResult {
  success: boolean;
  imageUrl?: string;
  storageKey?: string;
  revisedPrompt?: string;
  provider?: "built-in" | "fal.ai";
  fallbackUsed?: boolean;
  error?: string;
  providerErrors?: Array<{ provider: "built-in" | "fal.ai"; code: string; message: string }>;
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
};

export function getRequestedImageCount(message: string, maximum = 4): number {
  const normalized = message.toLowerCase();
  const numeric = normalized.match(/\b(\d{1,2})\s+(?:different\s+|separate\s+)?(?:(?:shopify|etsy|product|listing)\s+){0,3}(?:images?|pictures?|mockups?|variations?)\b/);
  if (numeric) return Math.max(1, Math.min(maximum, Number(numeric[1])));

  const word = normalized.match(/\b(one|two|three|four)\s+(?:different\s+|separate\s+)?(?:(?:shopify|etsy|product|listing)\s+){0,3}(?:images?|pictures?|mockups?|variations?)\b/);
  if (word) return Math.max(1, Math.min(maximum, NUMBER_WORDS[word[1]] || 1));

  if (/\b(?:some|several)\s+(?:images?|pictures?|mockups?|variations?)\b/.test(normalized)) return Math.min(3, maximum);
  return 1;
}

export function buildImageVariationPrompt(prompt: string, index: number, total: number): string {
  if (total <= 1) return prompt;
  return `${prompt}\n\nThis is composition variation ${index + 1} of ${total}. Keep the requested product and wording consistent, but use a clearly distinct professional camera angle or presentation setting from the other variations.`;
}

export function enhanceImagePrompt(prompt: string): string {
  const normalized = prompt.trim();
  const isProductMockup = /\b(?:mockup|product photo|listing image|product listing|etsy|shopify|digital product|printable displayed|screen display|tablet display|laptop display)\b/i.test(normalized);

  if (!isProductMockup) return normalized;

  return `${normalized}\n\nProduct mockup requirements: Create a polished, commercially usable product image with realistic lighting and natural proportions. Keep the complete featured product fully visible within the frame with comfortable margins. Preserve any wording supplied by the user exactly and render it clearly; do not invent extra pages, features, bundle contents, logos, watermarks, or additional text. Use a clean professional scene that supports the product rather than overpowering it.`;
}

/**
 * Generate one durable image. The primary provider is attempted once and the
 * backup provider is attempted at most once inside the shared service.
 */
export async function generateImage(
  prompt: string,
  options: {
    size?: "1024x1024" | "1792x1024" | "1024x1792";
    quality?: "auto" | "low" | "medium" | "high";
    style?: "vivid" | "natural";
    originalImages?: ImageReference[];
  } = {},
): Promise<ImageGenerationResult> {
  const improvedPrompt = enhanceImagePrompt(prompt);
  const result = await generateImageWithFallback(improvedPrompt, {
    size: options.size,
    quality: options.quality,
    originalImages: options.originalImages,
  });

  return {
    success: result.success,
    imageUrl: result.imageUrl,
    storageKey: result.storageKey,
    revisedPrompt: result.revisedPrompt,
    provider: result.provider,
    fallbackUsed: result.fallbackUsed,
    error: result.error,
    providerErrors: result.providerErrors,
  };
}

/**
 * Detect if a message is an unmistakable image generation request.
 */
export function isImageRequest(message: string): boolean {
  const normalized = message.toLowerCase().replace(/\s+/g, " ").trim();

  const nonGenerationContexts = [
    /\b(?:without|not|don't|do not|didn't|did not|isn't|is not|wasn't|was not|stop|avoid)\b[^.!?]{0,80}\b(?:generate|create|make|draw|design|illustrate)(?:d|s|ing)?\b[^.!?]{0,40}\b(?:image|picture|art|artwork|visual|logo|banner|mockup|thumbnail)\b/i,
    /\b(?:can|could|do) you (?:see|view|read|analy[sz]e|describe|inspect|look at)\b[^.!?]{0,80}\b(?:image|picture|photo|file|attachment|upload)\b/i,
    /\b(?:prompt|instructions?)\b[^.!?]{0,80}\b(?:generator|image generator)\b/i,
    /\b(?:write|give|make|create)\s+(?:me\s+)?(?:an?\s+)?(?:image\s+)?prompt\b/i,
  ];
  if (nonGenerationContexts.some((pattern) => pattern.test(normalized))) return false;

  const explicitImageRequests = [
    /\b(?:generate|create|make)\s+(?:me\s+)?(?:an?\s+)?(?:image|picture|artwork|illustration|visual|logo|banner|mockup|thumbnail)\b/i,
    /\b(?:generate|create|make)\s+(?:me\s+)?(?:(?:an?|some|several|one|two|three|four|\d+)\s+)?(?:(?:shopify|etsy|product|listing)\s+){0,3}mockups?\b/i,
    /\b(?:draw|illustrate)\s+(?:me\s+)?(?:an?\s+)?/i,
    /\b(?:image|picture|illustration|poster|logo|banner|thumbnail|mockup)\s+of\b/i,
    /\b(?:dall-e|dalle)\b/i,
  ];

  return explicitImageRequests.some((pattern) => pattern.test(normalized));
}

/**
 * Extract the image prompt from a user message without stripping useful product
 * details or wording that needs to appear in the result.
 */
export function extractImagePrompt(message: string): string {
  let prompt = message
    .replace(/^(please\s+)?(can you\s+)?(generate|create|make|draw|illustrate|design)\s+(me\s+)?(?:(?:an?|some|several|one|two|three|four|\d+)\s+)?(?:(?:shopify|etsy|product|listing)\s+){0,3}(images?|pictures?|logo|art|artwork|illustration|visual|banner|mockups?|thumbnail)\s*(of|for|that|showing|depicting|with)?\s*/i, "")
    .trim();

  if (prompt.length < 5) prompt = message.trim();
  return prompt;
}
