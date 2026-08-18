/**
 * Image Generation Worker — Scriptorium (primary), fal.ai (fallback), OpenAI DALL-E 3 (last resort)
 * Generates images from text prompts and stores them
 */
import { storagePut } from "./storage";
import { generateImage as forgeGenerateImage } from "./_core/imageGeneration";

export interface ImageGenerationResult {
  success: boolean;
  imageUrl?: string; // Storage URL for display
  storageKey?: string; // Key for R2/S3 storage
  revisedPrompt?: string; // DALL-E's revised prompt
  error?: string;
}

/**
 * Generate an image — tries built-in Forge ImageService first, falls back to OpenAI DALL-E 3
 */
export async function generateImage(
  prompt: string,
  options: {
    size?: "1024x1024" | "1792x1024" | "1024x1792";
    quality?: "auto" | "low" | "medium" | "high";
    style?: "vivid" | "natural";
  } = {}
): Promise<ImageGenerationResult> {
  // Primary: Built-in Forge ImageService (always available)
  try {
    const result = await forgeGenerateImage({ prompt });
    if (result.url) {
      return {
        success: true,
        imageUrl: result.url,
        revisedPrompt: prompt,
      };
    }
  } catch (forgeError: any) {
    console.warn("[ImageWorker] Forge ImageService failed, trying OpenAI DALL-E:", forgeError?.message);
  }

  // Primary Fallback: Scriptorium (composition layer + GPT-Image-2 = premium quality)
  const scriptoriumUrl = process.env.PRODUCTION_STUDIO_URL;
  if (scriptoriumUrl) {
    try {
      console.log("[ImageWorker] Trying Scriptorium at", scriptoriumUrl);
      const scriptResp = await fetch(`${scriptoriumUrl}/api/quick-create/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          pages: 1,
          style: "full-color",
          size: "1024x1024",
          upscale: false,
        }),
      });
      if (scriptResp.ok) {
        const contentType = scriptResp.headers.get("content-type") || "";
        let imageUrl: string | undefined;
        if (contentType.includes("text/event-stream")) {
          const text = await scriptResp.text();
          const lines = text.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.imageUrl || data.image_url || data.url) {
                  imageUrl = data.imageUrl || data.image_url || data.url;
                }
                if (data.pages && Array.isArray(data.pages)) {
                  for (const page of data.pages) {
                    if (page.imageUrl || page.image_url || page.url) {
                      imageUrl = page.imageUrl || page.image_url || page.url;
                    }
                  }
                }
              } catch {}
            }
          }
        } else {
          const data = await scriptResp.json() as any;
          imageUrl = data?.imageUrl || data?.image_url || data?.url || data?.pages?.[0]?.imageUrl || data?.pages?.[0]?.url;
        }
        if (imageUrl) {
          console.log("[ImageWorker] Scriptorium generated image:", imageUrl);
          return {
            success: true,
            imageUrl,
            revisedPrompt: prompt,
          };
        }
      } else {
        console.warn("[ImageWorker] Scriptorium failed:", scriptResp.status);
      }
    } catch (scriptError: any) {
      console.warn("[ImageWorker] Scriptorium error:", scriptError?.message);
    }
  }

  // Fallback 2: fal.ai Flux Pro (fast, no restrictions)
  const falKey = process.env.FAL_API_KEY;
  if (falKey) {
    try {
      const falResponse = await fetch("https://fal.run/fal-ai/flux-pro/v1.1-ultra", {
        method: "POST",
        headers: {
          "Authorization": `Key ${falKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          aspect_ratio: options.size === "1792x1024" ? "16:9" : options.size === "1024x1792" ? "9:16" : "1:1",
          output_format: "png",
          safety_tolerance: "5",
        }),
      });
      if (falResponse.ok) {
        const falData = await falResponse.json() as any;
        const imageUrl = falData?.images?.[0]?.url;
        if (imageUrl) {
          return {
            success: true,
            imageUrl,
            revisedPrompt: prompt,
          };
        }
      } else {
        const errText = await falResponse.text();
        console.warn("[ImageWorker] fal.ai failed:", falResponse.status, errText);
      }
    } catch (falError: any) {
      console.warn("[ImageWorker] fal.ai error:", falError?.message);
    }
  }

  // Fallback: OpenAI DALL-E 3
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { success: false, error: "Image generation service temporarily unavailable" };
  }

  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey });

    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: options.size || "1024x1024",
      quality: options.quality || "auto",
      style: options.style || "vivid",
      response_format: "b64_json",
    });

    const imageData = response.data?.[0];
    if (!imageData?.b64_json) {
      return { success: false, error: "No image data returned from DALL-E" };
    }

    const revisedPrompt = imageData.revised_prompt || prompt;

    // Convert base64 to buffer and store
    const buffer = Buffer.from(imageData.b64_json, "base64");
    const filename = `generated-images/${Date.now()}-${prompt.slice(0, 30).replace(/[^a-z0-9]/gi, "-")}.png`;

    try {
      const { key, url } = await storagePut(filename, buffer, "image/png");
      return {
        success: true,
        imageUrl: url,
        storageKey: key,
        revisedPrompt,
      };
    } catch (storageError: any) {
      // If storage fails, return as base64 data URL
      console.warn("[ImageWorker] Storage failed, returning base64:", storageError?.message);
      return {
        success: true,
        imageUrl: `data:image/png;base64,${imageData.b64_json}`,
        revisedPrompt,
      };
    }
  } catch (error: any) {
    console.error("[ImageWorker] DALL-E generation failed:", error?.message);
    return {
      success: false,
      error: error?.message || "Image generation failed",
    };
  }
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
