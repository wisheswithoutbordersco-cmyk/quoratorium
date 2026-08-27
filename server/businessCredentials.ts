import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import * as db from "./db";

export const BUSINESS_CONNECTION_ENTRY_TYPE = "credential";
export const BUSINESS_CONNECTION_RECORD_KIND = "business_connection";
const SHOPIFY_PROVIDER = "shopify";

interface StoredShopifyConnection {
  schemaVersion: 1;
  recordKind: typeof BUSINESS_CONNECTION_RECORD_KIND;
  provider: typeof SHOPIFY_PROVIDER;
  shopDomain: string;
  ciphertext: string;
  iv: string;
  authTag: string;
  updatedAt: string;
}

export interface ShopifyConnectionSecret {
  shopDomain: string;
  accessToken: string;
}

function encryptionKey(): Buffer {
  const secret = process.env.BUSINESS_CREDENTIAL_KEY || process.env.CLERK_SECRET_KEY || "";
  if (secret.length < 16) {
    throw new Error("Credential encryption is not configured");
  }
  return createHash("sha256")
    .update(`quoratorium-business-credentials-v1:${secret}`)
    .digest();
}

function encryptAccessToken(accessToken: string): Pick<StoredShopifyConnection, "ciphertext" | "iv" | "authTag"> {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(accessToken, "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
  };
}

function decryptAccessToken(metadata: StoredShopifyConnection): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(metadata.iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(metadata.authTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(metadata.ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function normalizeShopDomain(value: string): string {
  const domain = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain)) {
    throw new Error("Enter the permanent .myshopify.com store domain");
  }
  return domain;
}

function isStoredShopifyConnection(value: unknown): value is StoredShopifyConnection {
  if (!value || typeof value !== "object") return false;
  const metadata = value as Record<string, unknown>;
  return metadata.schemaVersion === 1 &&
    metadata.recordKind === BUSINESS_CONNECTION_RECORD_KIND &&
    metadata.provider === SHOPIFY_PROVIDER &&
    typeof metadata.shopDomain === "string" &&
    typeof metadata.ciphertext === "string" &&
    typeof metadata.iv === "string" &&
    typeof metadata.authTag === "string";
}

export async function saveShopifyConnection(input: {
  userId: number;
  shopDomain: string;
  accessToken: string;
}): Promise<{ shopDomain: string }> {
  const shopDomain = normalizeShopDomain(input.shopDomain);
  const accessToken = input.accessToken.trim();
  if (accessToken.length < 20 || accessToken.length > 1000) {
    throw new Error("Enter a valid Shopify Admin API access token");
  }

  const encrypted = encryptAccessToken(accessToken);
  const metadata: StoredShopifyConnection = {
    schemaVersion: 1,
    recordKind: BUSINESS_CONNECTION_RECORD_KIND,
    provider: SHOPIFY_PROVIDER,
    shopDomain,
    ...encrypted,
    updatedAt: new Date().toISOString(),
  };
  const existing = (await db.getUserVaultEntriesByType(
    input.userId,
    BUSINESS_CONNECTION_ENTRY_TYPE,
  )).find(entry =>
    entry.metadata?.recordKind === BUSINESS_CONNECTION_RECORD_KIND &&
    entry.metadata?.provider === SHOPIFY_PROVIDER,
  );

  if (existing) {
    await db.updateVaultEntry({
      id: existing.id,
      userId: input.userId,
      name: "Shopify connection",
      content: null,
      metadata,
    });
  } else {
    await db.createVaultEntry({
      user_id: input.userId,
      name: "Shopify connection",
      entry_type: BUSINESS_CONNECTION_ENTRY_TYPE,
      content: null,
      metadata,
    });
  }
  return { shopDomain };
}

export async function getStoredShopifyConnection(
  userId: number,
): Promise<ShopifyConnectionSecret | null> {
  const entry = (await db.getUserVaultEntriesByType(
    userId,
    BUSINESS_CONNECTION_ENTRY_TYPE,
  )).find(candidate =>
    candidate.metadata?.recordKind === BUSINESS_CONNECTION_RECORD_KIND &&
    candidate.metadata?.provider === SHOPIFY_PROVIDER,
  );
  if (!entry || !isStoredShopifyConnection(entry.metadata)) return null;

  return {
    shopDomain: normalizeShopDomain(entry.metadata.shopDomain),
    accessToken: decryptAccessToken(entry.metadata),
  };
}

export async function deleteShopifyConnection(userId: number): Promise<boolean> {
  const entries = await db.getUserVaultEntriesByType(
    userId,
    BUSINESS_CONNECTION_ENTRY_TYPE,
  );
  const matching = entries.filter(entry =>
    entry.metadata?.recordKind === BUSINESS_CONNECTION_RECORD_KIND &&
    entry.metadata?.provider === SHOPIFY_PROVIDER,
  );
  await Promise.all(matching.map(entry => db.deleteVaultEntry(entry.id, userId)));
  return matching.length > 0;
}
