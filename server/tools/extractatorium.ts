/**
 * Tool: extractorium_process
 * Send an existing worksheet, printable, or design image to Extractorium
 * (vision analysis) and get back its text/structure in a clean, prompt-ready
 * form. This is the "refresh" entrypoint of the -orium suite:
 * old image in -> prompt-ready structure out -> Scriptorium regenerates it.
 */
import { registerTool, type ToolContext, type ToolResult } from "./index";

const DEFAULT_EXTRACTORIUM_URL = "https://extractorium-production.up.railway.app";
const MAX_WAIT_MS = 120_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

/** tRPC wraps successful results as { result: { data: { json: <payload> } } } */
function unwrapTRPC(body: unknown): unknown {
  if (!isRecord(body)) return body;
  const result = body.result;
  if (!isRecord(result)) return body;
  const data = result.data;
  if (!isRecord(data)) return result;
  return "json" in data ? data.json : data;
}

function getErrorDetail(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const err = value.error;
  if (isRecord(err) && typeof err.message === "string") return err.message.slice(0, 500);
  for (const key of ["message", "details"]) {
    const detail = value[key];
    if (typeof detail === "string" && detail.trim()) return detail.trim().slice(0, 500);
  }
  return undefined;
}

function fileNameFromUrl(url: URL): string {
  const last = url.pathname.split("/").filter(Boolean).pop();
  return last && last.includes(".") ? last : "worksheet.png";
}

registerTool({
  name: "extractorium_process",
  description:
    "Analyze an existing worksheet, printable, poster, or design image and extract its text and structure into a clean, prompt-ready form. Use when the user wants to refresh, recreate, or reverse-engineer an EXISTING image. Do NOT use for creating brand-new visuals (use scriptorium_generate or generate_image for that).",
  parameters: {
    type: "object",
    properties: {
      imageUrl: {
        type: "string",
        description: "Public HTTPS URL of the image to analyze (worksheet, poster, printable).",
      },
    },
    required: ["imageUrl"],
    additionalProperties: false,
  },
  async execute(args: Record<string, any>, _context: ToolContext): Promise<ToolResult> {
    const imageUrl = typeof args.imageUrl === "string" ? args.imageUrl.trim() : "";
    if (!imageUrl) {
      return { success: false, output: "Missing image URL to analyze." };
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(imageUrl);
    } catch {
      return { success: false, output: "imageUrl is not a valid URL." };
    }
    if (parsedUrl.protocol !== "https:") {
      return { success: false, output: "imageUrl must be an https:// URL." };
    }

    const baseUrl = (process.env.EXTRACTORIUM_URL || DEFAULT_EXTRACTORIUM_URL).replace(/\/+$/, "");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MAX_WAIT_MS);

    try {
      // 1. Fetch the image bytes so we can send base64 to Extractorium.
      const imgResponse = await fetch(imageUrl, { signal: controller.signal });
      if (!imgResponse.ok) {
        return { success: false, output: `Could not fetch image (${imgResponse.status}) from ${imageUrl}.` };
      }
      const buffer = await imgResponse.arrayBuffer();
      if (buffer.byteLength === 0) {
        return { success: false, output: "Downloaded image was empty." };
      }
      if (buffer.byteLength > 10 * 1024 * 1024) {
        return { success: false, output: `Image is ${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB; Extractorium input should stay under 10MB.` };
      }

      const mimeType = imgResponse.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
      const imageBase64 = Buffer.from(buffer).toString("base64");

      // 2. Call Extractorium's tRPC document.analyzeVision mutation.
      const procResponse = await fetch(`${baseUrl}/api/trpc/document.analyzeVision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          json: {
            imageBase64,
            mimeType,
            fileName: fileNameFromUrl(parsedUrl),
            fileSize: buffer.byteLength,
          },
        }),
        signal: controller.signal,
      });
      const procBody = await readJson(procResponse);

      if (!procResponse.ok) {
        return {
          success: false,
          output: `Extractorium analysis failed (${procResponse.status}): ${getErrorDetail(procBody) || "No error details returned."}`,
        };
      }

      const payload = unwrapTRPC(procBody);
      const text = isRecord(payload)
        ? JSON.stringify(payload)
        : String(payload ?? "");

      if (!text.trim() || text.trim() === "{}") {
        return { success: false, output: "Extractorium returned an empty analysis." };
      }

      return {
        success: true,
        output: `Extractorium analyzed the image. Extracted structure: ${text.slice(0, 1200)}${text.length > 1200 ? "…" : ""}`,
        data: { extractorium: payload },
      };
    } catch (error: any) {
      const timedOut = error?.name === "AbortError";
      return {
        success: false,
        output: timedOut
          ? "Extractorium analysis timed out after 120 seconds."
          : `Extractorium analysis error: ${error?.message || "Unknown error"}`,
      };
    } finally {
      clearTimeout(timeout);
    }
  },
});
