/**
 * Tool: generate_image
 * Generate images using fal.ai Flux Pro (fast, no restrictions)
 * This is the fallback when Scriptorium is unavailable
 */
import { registerTool, type ToolContext, type ToolResult } from "./index";

registerTool({
  name: "generate_image",
  description: "Generate an AI image using fal.ai Flux Pro. Fast generation with no content restrictions. Use this as a fallback if scriptorium_generate fails, or for quick images.",
  parameters: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "The image generation prompt describing what to create.",
      },
      aspect_ratio: {
        type: "string",
        description: "Aspect ratio: '1:1' (square), '16:9' (landscape), '9:16' (portrait/phone wallpaper), '2:3' (poster). Defaults to '1:1'.",
      },
    },
    required: ["prompt"],
    additionalProperties: false,
  },
  async execute(args: Record<string, any>, _context: ToolContext): Promise<ToolResult> {
    const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
    if (!prompt) {
      return { success: false, output: "Missing image prompt." };
    }

    const falKey = process.env.FAL_API_KEY;
    if (!falKey) {
      return { success: false, output: "FAL_API_KEY not configured." };
    }

    const aspect_ratio = args.aspect_ratio || "1:1";

    try {
      const response = await fetch("https://fal.run/fal-ai/flux-pro/v1.1-ultra", {
        method: "POST",
        headers: {
          "Authorization": `Key ${falKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          aspect_ratio,
          output_format: "png",
          safety_tolerance: "5",
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return { success: false, output: `fal.ai error (${response.status}): ${errText.slice(0, 200)}` };
      }

      const data = await response.json() as any;
      const imageUrl = data?.images?.[0]?.url;

      if (!imageUrl) {
        return { success: false, output: "fal.ai returned no image URL." };
      }

      return {
        success: true,
        output: `Image generated successfully!\n\nImage URL: ${imageUrl}\n\nPrompt used: ${prompt}`,
        data: { imageUrl, provider: "fal.ai" },
        artifacts: [{ type: "image", name: "Generated image", url: imageUrl }],
      };
    } catch (err: any) {
      return { success: false, output: `Image generation failed: ${err?.message || "Unknown error"}` };
    }
  },
});
