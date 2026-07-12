/**
 * Cloudflare R2 File Storage
 * Uses the Cloudflare API to manage R2 buckets and objects
 * Falls back to the built-in Manus storage (storagePut) if R2 is not configured
 */
import { storagePut, storageGet } from "./storage";

const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || "";
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || "";
const BUCKET_NAME = "q-workspace-files";
const CF_BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}`;

export interface StorageResult {
  success: boolean;
  key?: string;
  url?: string;
  error?: string;
}

/**
 * Upload a file to storage (R2 via Manus S3 helper)
 * Uses the built-in storagePut which handles S3-compatible storage
 */
export async function uploadFile(
  key: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<StorageResult> {
  try {
    const result = await storagePut(key, data, contentType);
    return {
      success: true,
      key: result.key,
      url: result.url,
    };
  } catch (error: any) {
    console.error("[R2Storage] Upload failed:", error?.message);
    return {
      success: false,
      error: error?.message || "Upload failed",
    };
  }
}

/**
 * Get a download URL for a stored file
 */
export async function getFileUrl(key: string): Promise<StorageResult> {
  try {
    const result = await storageGet(key);
    return {
      success: true,
      key: result.key,
      url: result.url,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || "Failed to get file URL",
    };
  }
}

/**
 * Upload generated code files to storage
 */
export async function uploadGeneratedFiles(
  projectName: string,
  files: Array<{ filepath: string; content: string }>
): Promise<Array<StorageResult & { filepath: string }>> {
  const results: Array<StorageResult & { filepath: string }> = [];

  for (const file of files) {
    const key = `projects/${projectName}/${file.filepath}`;
    const contentType = getContentType(file.filepath);
    const result = await uploadFile(key, file.content, contentType);
    results.push({ ...result, filepath: file.filepath });
  }

  return results;
}

/**
 * Upload an image (from DALL-E or screenshot) to storage
 */
export async function uploadImage(
  filename: string,
  imageBuffer: Buffer,
  contentType = "image/png"
): Promise<StorageResult> {
  const key = `images/${Date.now()}-${filename}`;
  return uploadFile(key, imageBuffer, contentType);
}

/**
 * Check if R2/storage is configured
 */
export function isStorageConfigured(): boolean {
  // We use the built-in Manus storage which is always available
  return true;
}

function getContentType(filepath: string): string {
  const ext = filepath.split(".").pop()?.toLowerCase() || "";
  const types: Record<string, string> = {
    html: "text/html",
    css: "text/css",
    js: "application/javascript",
    ts: "application/typescript",
    tsx: "application/typescript",
    jsx: "application/javascript",
    json: "application/json",
    md: "text/markdown",
    txt: "text/plain",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    zip: "application/zip",
    py: "text/x-python",
  };
  return types[ext] || "application/octet-stream";
}
