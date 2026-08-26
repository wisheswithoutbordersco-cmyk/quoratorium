/**
 * Tool: generate_image
 * Generate images directly with OpenAI; fal.ai is the reliability fallback.
 */
import { registerTool, type ToolContext, type ToolResult } from "./index";
import { generateImageWithFallback, type ImageAspectRatio } from "../imageGenerationService";

registerTool({
  name: "generate_image",
  description: "Generate an AI image with OpenAI GPT Image first. fal.ai is used automatically only if OpenAI fails or is unavailable.",
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

    const result = await generateImageWithFallback(prompt, {
      aspectRatio: (args.aspect_ratio || "1:1") as ImageAspectRatio,
    });

    if (!result.success || !result.imageUrl) {
      const details = result.providerErrors?.map(error => `${error.provider}: ${error.message}`).join("; ");
      return { success: false, output: `${result.error || "Image generation failed"}${details ? ` (${details})` : ""}` };
    }

    return {
      success: true,
      output: `Image generated successfully with ${result.provider}${result.fallbackUsed ? " fallback" : ""}. The image is attached as a structured artifact. Prompt used: ${prompt}`,
      data: {
        imageUrl: result.imageUrl,
        provider: result.provider,
        model: result.model,
        fallbackUsed: result.fallbackUsed,
      },
      artifacts: [{ type: "image", name: "Generated image", url: result.imageUrl }],
    };
  },
});
