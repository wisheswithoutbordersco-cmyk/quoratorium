/**
 * Tool: scriptorium_generate
 * Generate a premium-quality image through Scriptorium's composition layer.
 *
 * Scriptorium Quick Create uses a two-step job API: create the job, then poll
 * its status until the first generated page exposes an image URL.
 */
import { registerTool, type ToolContext, type ToolResult } from "./index";

const DEFAULT_PRODUCTION_STUDIO_URL = "https://wish-production-studio-production.up.railway.app";
const POLL_INTERVAL_MS = 5_000;
const MAX_WAIT_MS = 120_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getErrorDetail(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;

  for (const key of ["error", "message", "details"]) {
    const detail = value[key];
    if (typeof detail === "string" && detail.trim()) return detail.trim();
  }

  return undefined;
}

function getImageUrl(job: unknown): string | undefined {
  if (!isRecord(job) || !Array.isArray(job.pages) || job.pages.length === 0) {
    return undefined;
  }

  const firstPage = job.pages[0];
  if (!isRecord(firstPage)) return undefined;

  const imageUrl = firstPage.imageUrl ?? firstPage.url;
  return typeof imageUrl === "string" && imageUrl.trim() ? imageUrl : undefined;
}

function getJobFailureDetail(job: unknown): string | undefined {
  if (!isRecord(job)) return undefined;

  const error = job.error;
  if (typeof error === "string" && error.trim()) return error.trim();
  if (isRecord(error)) return getErrorDetail(error);

  return undefined;
}

async function readJson(response: Response): Promise<unknown> {
  const body = await response.text();
  if (!body.trim()) return {};

  try {
    return JSON.parse(body);
  } catch {
    return { message: body.slice(0, 500) };
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

registerTool({
  name: "scriptorium_generate",
  description:
    "Generate a high-quality AI image using Scriptorium's composition layer. Use this first for premium image requests.",
  parameters: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "The complete image-generation prompt to send to Scriptorium.",
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

    const studioUrl = (process.env.PRODUCTION_STUDIO_URL || DEFAULT_PRODUCTION_STUDIO_URL).replace(/\/+$/, "");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MAX_WAIT_MS);
    const startedAt = Date.now();
    let lastPollError: string | undefined;

    try {
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
        signal: controller.signal,
      });
      const createBody = await readJson(createResponse);

      if (!createResponse.ok) {
        return {
          success: false,
          output: `Scriptorium job creation failed (${createResponse.status}): ${getErrorDetail(createBody) || "No error details returned."}`,
        };
      }

      const jobId = isRecord(createBody) && typeof createBody.jobId === "string" ? createBody.jobId : "";
      if (!jobId) {
        return { success: false, output: "Scriptorium returned no job ID." };
      }

      while (Date.now() - startedAt < MAX_WAIT_MS) {
        const remainingMs = MAX_WAIT_MS - (Date.now() - startedAt);
        await sleep(Math.min(POLL_INTERVAL_MS, Math.max(0, remainingMs)));

        if (controller.signal.aborted) break;

        try {
          const jobResponse = await fetch(`${studioUrl}/api/generate/job/${encodeURIComponent(jobId)}`, {
            headers: { Accept: "application/json" },
            signal: controller.signal,
          });
          const job = await readJson(jobResponse);

          if (!jobResponse.ok) {
            lastPollError = `Status check failed (${jobResponse.status}): ${getErrorDetail(job) || "No error details returned."}`;
            continue;
          }

          const status = isRecord(job) && typeof job.status === "string" ? job.status.toLowerCase() : "";
          const errorDetail = getJobFailureDetail(job);
          if (status === "error" || status === "failed" || errorDetail) {
            return {
              success: false,
              output: `Scriptorium generation failed: ${errorDetail || `Job status: ${status || "unknown"}`}`,
            };
          }

          if (status === "complete" || status === "done") {
            const imageUrl = getImageUrl(job);
            if (!imageUrl) {
              return {
                success: false,
                output: "Scriptorium completed but no image URL was found in pages[0].imageUrl or pages[0].url.",
              };
            }

            return {
              success: true,
              output: `Scriptorium generated the image: ${imageUrl}`,
              data: { imageUrl, provider: "scriptorium", jobId },
              artifacts: [{ type: "image", name: "Scriptorium generated image", url: imageUrl }],
            };
          }
        } catch (error: any) {
          if (error?.name === "AbortError") throw error;
          lastPollError = error?.message || "Unknown status-check error.";
        }
      }

      return {
        success: false,
        output: `Scriptorium generation timed out after 120 seconds.${lastPollError ? ` Last poll issue: ${lastPollError}` : ""}`,
      };
    } catch (error: any) {
      const timedOut = error?.name === "AbortError";
      return {
        success: false,
        output: timedOut
          ? "Scriptorium generation timed out after 120 seconds."
          : `Scriptorium generation error: ${error?.message || "Unknown error"}`,
      };
    } finally {
      clearTimeout(timeout);
    }
  },
});
