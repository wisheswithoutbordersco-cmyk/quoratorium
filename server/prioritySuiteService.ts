import { isIP } from "node:net";
import { addOrchestrationEvent } from "./db";
import { resolveChatAssetRecords } from "./chatAssets";

export type ExtractoriumOperation = "process" | "analyzeVision";
export type TemplatoriumMode = "global" | "tile";

export type OwnerImageAttachment = {
  id: string;
  name: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  size: number;
  base64: string;
  dataUrl: string;
};

export type PriorityServiceStatus = {
  system: "Extractorium" | "Templatorium";
  configured: boolean;
  connected: boolean;
  message: string;
};

const DEFAULT_EXTRACTORIUM_URL =
  "https://extractorium-production.up.railway.app";
const DEFAULT_TEMPLATORIUM_URL =
  "https://templatorium-production.up.railway.app";
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_RESPONSE_CHARS = 2 * 1024 * 1024;
const ATTACHMENT_TIMEOUT_MS = 30_000;
const STATUS_TIMEOUT_MS = 12_000;
const ANALYSIS_TIMEOUT_MS = 150_000;
const SUPPORTED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type FetchImplementation = typeof fetch;

export class PrioritySuiteServiceError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "PrioritySuiteServiceError";
  }
}

function serviceToken(): string {
  const token = process.env.TORIU_SERVICE_TOKEN?.trim();
  if (!token) {
    throw new PrioritySuiteServiceError(
      "Toríu's suite service credential is not configured."
    );
  }
  return token;
}

function serviceUrl(system: "extractorium" | "templatorium"): string {
  const raw =
    system === "extractorium"
      ? process.env.EXTRACTORIUM_API_URL ||
        process.env.EXTRACTORIUM_URL ||
        DEFAULT_EXTRACTORIUM_URL
      : process.env.TEMPLATORIUM_API_URL || DEFAULT_TEMPLATORIUM_URL;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new PrioritySuiteServiceError(
      `${system === "extractorium" ? "Extractorium" : "Templatorium"} has an invalid service URL.`
    );
  }
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if (
    parsed.protocol !== "https:" &&
    !(process.env.NODE_ENV !== "production" && isLocal)
  ) {
    throw new PrioritySuiteServiceError(
      `${system === "extractorium" ? "Extractorium" : "Templatorium"} must use HTTPS.`
    );
  }
  if (isIP(parsed.hostname) && !isLocal) {
    throw new PrioritySuiteServiceError(
      "Public service URLs cannot use a raw IP address."
    );
  }
  return parsed.toString().replace(/\/+$/, "");
}

function normalizeMimeType(value: string): OwnerImageAttachment["mimeType"] {
  const normalized =
    value.trim().toLowerCase() === "image/jpg"
      ? "image/jpeg"
      : value.trim().toLowerCase();
  if (!SUPPORTED_MIME_TYPES.has(normalized)) {
    throw new PrioritySuiteServiceError(
      "Attach a PNG, JPEG, or WebP image for this capability."
    );
  }
  return normalized as OwnerImageAttachment["mimeType"];
}

function hasExpectedImageSignature(
  mimeType: OwnerImageAttachment["mimeType"],
  bytes: Buffer
): boolean {
  if (mimeType === "image/jpeg") {
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  }
  if (mimeType === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
    );
  }
  return (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  );
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const body = await response.text();
  if (body.length > MAX_RESPONSE_CHARS) {
    throw new PrioritySuiteServiceError(
      "The connected service returned an unexpectedly large response."
    );
  }
  if (!body.trim()) return {};
  try {
    return JSON.parse(body);
  } catch {
    throw new PrioritySuiteServiceError(
      `The connected service returned an invalid response (${response.status}).`,
      response.status
    );
  }
}

function responseError(
  body: unknown,
  status: number
): PrioritySuiteServiceError {
  const message =
    body &&
    typeof body === "object" &&
    "error" in body &&
    typeof body.error === "string"
      ? body.error.slice(0, 240)
      : `The connected service returned HTTP ${status}.`;
  return new PrioritySuiteServiceError(message, status);
}

async function requestServiceJson(input: {
  system: "extractorium" | "templatorium";
  path: string;
  method?: "GET" | "POST";
  body?: unknown;
  timeoutMs: number;
  fetchImpl?: FetchImplementation;
}): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
  const token = serviceToken();
  try {
    const response = await (input.fetchImpl ?? fetch)(
      `${serviceUrl(input.system)}${input.path}`,
      {
        method: input.method ?? "GET",
        headers: {
          Accept: "application/json",
          ...(input.body === undefined
            ? {}
            : { "Content-Type": "application/json" }),
          ...(input.system === "extractorium"
            ? { Authorization: `Bearer ${token}` }
            : { "x-toriu-service-token": token }),
        },
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
        redirect: "error",
        signal: controller.signal,
      }
    );
    const body = await readJsonResponse(response);
    if (!response.ok) throw responseError(body, response.status);
    return body;
  } catch (error) {
    if (error instanceof PrioritySuiteServiceError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new PrioritySuiteServiceError(
        `${input.system === "extractorium" ? "Extractorium" : "Templatorium"} timed out.`
      );
    }
    throw new PrioritySuiteServiceError(
      `${input.system === "extractorium" ? "Extractorium" : "Templatorium"} could not be reached.`
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function loadOwnerImageAttachment(
  userId: number,
  assetIds: string[],
  fetchImpl: FetchImplementation = fetch
): Promise<OwnerImageAttachment> {
  const selectedIds = assetIds.slice(0, 1);
  if (selectedIds.length === 0) {
    throw new PrioritySuiteServiceError(
      "Attach one PNG, JPEG, or WebP image in this message first."
    );
  }
  const records = await resolveChatAssetRecords(userId, selectedIds);
  const record = records[0];
  if (!record) {
    throw new PrioritySuiteServiceError(
      "The attached image could not be retrieved from owner-scoped storage."
    );
  }
  const mimeType = normalizeMimeType(record.type);
  if (record.size <= 0 || record.size > MAX_ATTACHMENT_BYTES) {
    throw new PrioritySuiteServiceError(
      "The attached image must be between 1 byte and 10 MB."
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ATTACHMENT_TIMEOUT_MS);
  try {
    const response = await fetchImpl(record.url, {
      headers: { Accept: mimeType },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new PrioritySuiteServiceError(
        `The attached image could not be loaded (${response.status}).`
      );
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (
      bytes.byteLength === 0 ||
      bytes.byteLength > MAX_ATTACHMENT_BYTES ||
      !hasExpectedImageSignature(mimeType, bytes)
    ) {
      throw new PrioritySuiteServiceError(
        "The attached file is not a valid PNG, JPEG, or WebP image."
      );
    }
    return {
      id: record.id,
      name: record.name.slice(0, 255),
      mimeType,
      size: bytes.byteLength,
      base64: bytes.toString("base64"),
      dataUrl: `data:${mimeType};base64,${bytes.toString("base64")}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function analyzeWithExtractorium(
  operation: ExtractoriumOperation,
  image: OwnerImageAttachment,
  fetchImpl?: FetchImplementation
): Promise<Record<string, unknown>> {
  const result = await requestServiceJson({
    system: "extractorium",
    path: "/api/toriu/document-analysis",
    method: "POST",
    body: {
      operation,
      image: {
        base64: image.base64,
        mime: image.mimeType,
        name: image.name,
        size: image.size,
      },
    },
    timeoutMs: ANALYSIS_TIMEOUT_MS,
    fetchImpl,
  });
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new PrioritySuiteServiceError(
      "Extractorium returned an unexpected result."
    );
  }
  return result as Record<string, unknown>;
}

export async function detectWithTemplatorium(
  mode: TemplatoriumMode,
  image: OwnerImageAttachment,
  fetchImpl?: FetchImplementation
): Promise<Record<string, unknown>> {
  const result = await requestServiceJson({
    system: "templatorium",
    path: "/api/toriu/vision/detect",
    method: "POST",
    body: { imageDataUrl: image.dataUrl, mode },
    timeoutMs: ANALYSIS_TIMEOUT_MS,
    fetchImpl,
  });
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new PrioritySuiteServiceError(
      "Templatorium returned an unexpected result."
    );
  }
  return result as Record<string, unknown>;
}

async function checkService(
  system: "extractorium" | "templatorium",
  fetchImpl?: FetchImplementation
): Promise<PriorityServiceStatus> {
  const label = system === "extractorium" ? "Extractorium" : "Templatorium";
  if (!process.env.TORIU_SERVICE_TOKEN?.trim()) {
    return {
      system: label,
      configured: false,
      connected: false,
      message: "Service credential is not configured.",
    };
  }
  try {
    await requestServiceJson({
      system,
      path: "/api/toriu/status",
      timeoutMs: STATUS_TIMEOUT_MS,
      fetchImpl,
    });
    return {
      system: label,
      configured: true,
      connected: true,
      message: "Authenticated service connection is available.",
    };
  } catch (error) {
    return {
      system: label,
      configured: true,
      connected: false,
      message:
        error instanceof Error
          ? error.message
          : "Authenticated service connection is unavailable.",
    };
  }
}

export async function getPriorityServiceStatuses(
  fetchImpl?: FetchImplementation
): Promise<PriorityServiceStatus[]> {
  return Promise.all([
    checkService("extractorium", fetchImpl),
    checkService("templatorium", fetchImpl),
  ]);
}

export async function recordPrioritySuiteAudit(input: {
  system: "Extractorium" | "Templatorium";
  capability: string;
  eventType: string;
  userId: number;
  projectId?: number | null;
  operation: string;
  assetName: string;
  outcome: "completed" | "failed";
  resultCount?: number;
}): Promise<void> {
  try {
    await addOrchestrationEvent({
      user_id: input.userId,
      project_id: input.projectId ?? null,
      event_type: input.eventType,
      agent_name: `Toríu · ${input.system}`,
      summary:
        input.outcome === "completed"
          ? `${input.system} ${input.operation} completed for ${input.assetName}`
          : `${input.system} ${input.operation} failed for ${input.assetName}`,
      payload: {
        capability: input.capability,
        permission: "read",
        risk: "medium",
        confirmation: "none",
        operation: input.operation,
        assetNames: [input.assetName],
        resultCount: input.resultCount,
        outcome: input.outcome,
      },
    });
  } catch (error) {
    console.warn(`[${input.system}] Failed to record capability audit`, error);
  }
}
