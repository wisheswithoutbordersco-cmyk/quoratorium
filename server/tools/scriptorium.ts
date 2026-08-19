/**
 * Tool: scriptorium_generate
 * Generate high-quality AI images using Scriptorium's composition layer.
 * Uses the two-step job system: POST to create job, then poll for result.
 */
import { registerTool, type ToolContext, type ToolResult } from "./index";

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_TIME_MS = 5 * 60 * 1000; // 5 minutes max

registerTool({
  name: "scriptorium_generate",
  description:
    "Generate a high-quality AI image using Scriptorium's composition layer (GPT-4o prompt enhancement + GPT-Image-2). Premium quality output. Use this for wall art, posters, and product images.",
  parameters: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "The image-generation prompt to send to Scriptorium.",
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

    const studioUrl = (process.env.PRODUCTION_STUDIO_URL || "").replace(/\/+$/, "");
    if (!studioUrl) {
      return { success: false, output: "PRODUCTION_STUDIO_URL not configured." };
    }

    try {
      // Step 1: Create the generation job
      const createResponse = await fetch(`${studioUrl}/api/generate/quick-create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customPrompt: prompt,
          pageCount: 1,
          outputStyle: "full-color",
          sizePreset: "1024x1024",
          upscale: false,
          branding: "off",
          showPageNumbers: false,
        }),
      });

      if (!createResponse.ok) {
        const errText = await createResponse.text();
        return { success: false, output: `Scriptorium job creation failed (${createResponse.status}): ${errText.slice(0, 200)}` };
      }

      const { jobId } = await createResponse.json() as { jobId: string };
      if (!jobId) {
        return { success: false, output: "Scriptorium returned no job ID." };
      }

      // Step 2: Poll for completion
      const startTime = Date.now();
      while (Date.now() - startTime < MAX_POLL_TIME_MS) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));

        const controller = new AbortController();
        const pollTimeout = setTimeout(() => controller.abort(), 30000);

        try {
          const pollResponse = await fetch(`${studioUrl}/api/generate/job/${jobId}`, {
            signal: controller.signal,
          });
          clearTimeout(pollTimeout);

          if (!pollResponse.ok) {
            // Job might still be processing, keep polling
            continue;
          }

          const jobData = await pollResponse.json() as any;

          if (jobData.status === "error" || jobData.error) {
            return { success: false, output: `Scriptorium generation error: ${jobData.error || "Unknown error"}` };
          }

          if (jobData.status === "complete" || jobData.status === "done") {
            // Find the image URL in the response
            const imageUrl = jobData.pages?.[0]?.imageUrl 
              || jobData.pages?.[0]?.url 
              || jobData.imageUrl 
              || jobData.url;

            if (imageUrl) {
              return {
                success: true,
                output: `Image generated successfully via Scriptorium!\n\nImage URL: ${imageUrl}`,
                data: { imageUrl, provider: "scriptorium", jobId },
                artifacts: [{ type: "image", name: "Scriptorium image", url: imageUrl }],
              };
            }
            return { success: false, output: "Scriptorium completed but no image URL found in response." };
          }

          // Still processing — continue polling
        } catch (pollErr: any) {
          clearTimeout(pollTimeout);
          if (pollErr?.name === "AbortError") {
            // Poll timed out, try again
            continue;
          }
          // Other error, keep trying
          continue;
        }
      }

      return { success: false, output: "Scriptorium generation timed out after 5 minutes." };
    } catch (err: any) {
      return { success: false, output: `Scriptorium error: ${err?.message || "Unknown error"}` };
    }
  },
});
