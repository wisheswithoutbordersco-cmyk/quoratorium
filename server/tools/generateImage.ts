/**
 * Tool: generate_image
 * Generate images with Q's preconfigured GPT Image service; fal.ai is the one reliability fallback.
 */
import { registerTool, type ToolContext, type ToolResult } from "./index";
import { generateImageWithFallback, type ImageAspectRatio } from "../imageGenerationService";

registerTool({
  name: "generate_image",
  description: "Create one new AI image through Q's reliable image pipeline. Use only for an explicit image-creation request. The server performs at most one provider fallback automatically, so never call this tool repeatedly for the same request. Never use it for attached-image analysis, character identification, counting, description, or a request that asks only for a reusable prompt.",
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
      quality: "high",
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
