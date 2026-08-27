// Durable private object-storage helpers for Captain Q.
// Forge/S3 remains the preferred backend when configured. Railway falls back to
// the existing Supabase service-role connection and a private storage bucket.

import { ENV } from "./_core/env";
import { getSupabaseAdmin } from "./supabase";

const SUPABASE_ASSET_BUCKET = "quoratorium-assets";
const SUPABASE_KEY_PREFIX = "supabase:";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

let ensureSupabaseBucketPromise: Promise<void> | null = null;

function getForgeConfig(): { forgeUrl: string; forgeKey: string } | null {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;
  if (!forgeUrl || !forgeKey) return null;
  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

function isSupabaseKey(key: string): boolean {
  return key.startsWith(SUPABASE_KEY_PREFIX);
}

function stripSupabasePrefix(key: string): string {
  return normalizeKey(key.slice(SUPABASE_KEY_PREFIX.length));
}

async function ensureSupabaseBucket(): Promise<void> {
  if (ensureSupabaseBucketPromise) return ensureSupabaseBucketPromise;

  ensureSupabaseBucketPromise = (async () => {
    const client = getSupabaseAdmin();
    if (!client) {
      throw new Error(
        "Supabase storage config missing: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
      );
    }

    const { data: existing } = await client.storage.getBucket(SUPABASE_ASSET_BUCKET);
    if (existing) return;

    const { error } = await client.storage.createBucket(SUPABASE_ASSET_BUCKET, {
      public: false,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    });

    if (error && !error.message.toLowerCase().includes("already exists")) {
      throw new Error(`Supabase bucket creation failed: ${error.message}`);
    }
  })().catch(error => {
    ensureSupabaseBucketPromise = null;
    throw error;
  });

  return ensureSupabaseBucketPromise;
}

async function forgePut(
  config: { forgeUrl: string; forgeKey: string },
  key: string,
  data: Buffer | Uint8Array | string,
  contentType: string,
): Promise<{ key: string; url: string }> {
  const presignUrl = new URL("v1/storage/presign/put", config.forgeUrl + "/");
  presignUrl.searchParams.set("path", key);

  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${config.forgeKey}` },
  });

  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }

  const { url: s3Url } = (await presignResp.json()) as { url: string };
  if (!s3Url) throw new Error("Forge returned empty presign URL");

  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as BlobPart], { type: contentType });

  const uploadResp = await fetch(s3Url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });

  if (!uploadResp.ok) {
    throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
  }

  return { key, url: `/manus-storage/${key}` };
}

async function supabasePut(
  key: string,
  data: Buffer | Uint8Array | string,
  contentType: string,
): Promise<{ key: string; url: string }> {
  await ensureSupabaseBucket();
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase storage is unavailable");

  const bytes = typeof data === "string" ? Buffer.from(data) : data;
  const { error: uploadError } = await client.storage
    .from(SUPABASE_ASSET_BUCKET)
    .upload(key, bytes, { contentType, upsert: false });

  if (uploadError) {
    throw new Error(`Supabase storage upload failed: ${uploadError.message}`);
  }

  const storedKey = `${SUPABASE_KEY_PREFIX}${key}`;
  return { key: storedKey, url: await storageGetSignedUrl(storedKey) };
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  const forge = getForgeConfig();
  let forgeError: unknown;

  if (forge) {
    try {
      return await forgePut(forge, key, data, contentType);
    } catch (error) {
      forgeError = error;
      console.warn("[Storage] Forge upload failed; trying private Supabase storage", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  try {
    return await supabasePut(key, data, contentType);
  } catch (supabaseError) {
    const reasons = [forgeError, supabaseError]
      .filter(Boolean)
      .map(error => (error instanceof Error ? error.message : String(error)))
      .join("; ");
    throw new Error(`No durable storage backend succeeded: ${reasons}`);
  }
}

export async function storageGet(
  relKey: string,
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  if (isSupabaseKey(key)) {
    return { key, url: await storageGetSignedUrl(key) };
  }
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);

  if (isSupabaseKey(key)) {
    const client = getSupabaseAdmin();
    if (!client) throw new Error("Supabase storage is unavailable");
    const { data, error } = await client.storage
      .from(SUPABASE_ASSET_BUCKET)
      .createSignedUrl(stripSupabasePrefix(key), SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) {
      throw new Error(`Supabase signed URL failed: ${error?.message || "empty URL"}`);
    }
    return data.signedUrl;
  }

  const forge = getForgeConfig();
  if (!forge) {
    throw new Error(
      "Forge storage config missing for this legacy asset: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY",
    );
  }

  const getUrl = new URL("v1/storage/presign/get", forge.forgeUrl + "/");
  getUrl.searchParams.set("path", key);
  const resp = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${forge.forgeKey}` },
  });

  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Storage signed URL failed (${resp.status}): ${msg}`);
  }

  const { url } = (await resp.json()) as { url: string };
  if (!url) throw new Error("Forge returned empty signed URL");
  return url;
}

export async function storageDelete(relKey: string): Promise<boolean> {
  const key = normalizeKey(relKey);
  if (!isSupabaseKey(key)) {
    // The legacy Forge helper exposes presign put/get only. Keep the database
    // reference cleanup deterministic even when physical deletion is unavailable.
    return false;
  }

  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase storage is unavailable");
  const { error } = await client.storage
    .from(SUPABASE_ASSET_BUCKET)
    .remove([stripSupabasePrefix(key)]);
  if (error) throw new Error(`Supabase storage deletion failed: ${error.message}`);
  return true;
}
