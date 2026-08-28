import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import * as db from "./db";

export const BUSINESS_CONNECTION_ENTRY_TYPE = "credential";
export const BUSINESS_CONNECTION_RECORD_KIND = "business_connection";
const SHOPIFY_PROVIDER = "shopify";

type ShopifyAuthMode = "access_token" | "client_credentials";

interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
}

interface StoredShopifyConnectionV1 extends EncryptedSecret {
  schemaVersion: 1;
  recordKind: typeof BUSINESS_CONNECTION_RECORD_KIND;
  provider: typeof SHOPIFY_PROVIDER;
  shopDomain: string;
  updatedAt: string;
}

interface StoredShopifyConnectionV2 extends EncryptedSecret {
  schemaVersion: 2;
  recordKind: typeof BUSINESS_CONNECTION_RECORD_KIND;
  provider: typeof SHOPIFY_PROVIDER;
  authMode: ShopifyAuthMode;
  shopDomain: string;
  updatedAt: string;
}

type StoredShopifyConnection = StoredShopifyConnectionV1 | StoredShopifyConnectionV2;

export type ShopifyConnectionSecret =
  | {
      authMode: "access_token";
      shopDomain: string;
      accessToken: string;
    }
  | {
      authMode: "client_credentials";
      shopDomain: string;
      clientId: string;
      clientSecret: string;
    };

function encryptionKey(): Buffer {
  const secret = process.env.BUSINESS_CREDENTIAL_KEY || process.env.CLERK_SECRET_KEY || "";
  if (secret.length < 16) {
    throw new Error("Credential encryption is not configured");
  }
  return createHash("sha256")
    .update(`quoratorium-business-credentials-v1:${secret}`)
    .digest();
}

function encryptSecret(secret: string): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
  };
}

function decryptSecret(metadata: EncryptedSecret): string {
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

export function normalizeShopDomain(value: string): string {
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

function isEncryptedSecret(value: Record<string, unknown>): boolean {
  return typeof value.ciphertext === "string" &&
    typeof value.iv === "string" &&
    typeof value.authTag === "string";
}

function isStoredShopifyConnection(value: unknown): value is StoredShopifyConnection {
  if (!value || typeof value !== "object") return false;
  const metadata = value as Record<string, unknown>;
  const baseValid = metadata.recordKind === BUSINESS_CONNECTION_RECORD_KIND &&
    metadata.provider === SHOPIFY_PROVIDER &&
    typeof metadata.shopDomain === "string" &&
    isEncryptedSecret(metadata);
  if (!baseValid) return false;
  if (metadata.schemaVersion === 1) return true;
  return metadata.schemaVersion === 2 &&
    (metadata.authMode === "access_token" || metadata.authMode === "client_credentials");
}

async function persistShopifyConnection(input: {
  userId: number;
  shopDomain: string;
  authMode: ShopifyAuthMode;
  secret: string;
}): Promise<{ shopDomain: string }> {
  const shopDomain = normalizeShopDomain(input.shopDomain);
  const encrypted = encryptSecret(input.secret);
  const metadata: StoredShopifyConnectionV2 = {
    schemaVersion: 2,
    recordKind: BUSINESS_CONNECTION_RECORD_KIND,
    provider: SHOPIFY_PROVIDER,
    authMode: input.authMode,
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

export async function saveShopifyConnection(input: {
  userId: number;
  shopDomain: string;
  accessToken: string;
}): Promise<{ shopDomain: string }> {
  const accessToken = input.accessToken.trim();
  if (accessToken.length < 20 || accessToken.length > 1000) {
    throw new Error("Enter a valid Shopify Admin API access token");
  }
  return persistShopifyConnection({
    userId: input.userId,
    shopDomain: input.shopDomain,
    authMode: "access_token",
    secret: accessToken,
  });
}

export async function saveShopifyClientCredentials(input: {
  userId: number;
  shopDomain: string;
  clientId: string;
  clientSecret: string;
}): Promise<{ shopDomain: string }> {
  const clientId = input.clientId.trim();
  const clientSecret = input.clientSecret.trim();
  if (clientId.length < 8 || clientId.length > 255) {
    throw new Error("Enter a valid Shopify client ID");
  }
  if (clientSecret.length < 20 || clientSecret.length > 1000) {
    throw new Error("Enter a valid Shopify client secret");
  }
  return persistShopifyConnection({
    userId: input.userId,
    shopDomain: input.shopDomain,
    authMode: "client_credentials",
    secret: JSON.stringify({ clientId, clientSecret }),
  });
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

  const shopDomain = normalizeShopDomain(entry.metadata.shopDomain);
  const secret = decryptSecret(entry.metadata);
  if (entry.metadata.schemaVersion === 1 || entry.metadata.authMode === "access_token") {
    return { authMode: "access_token", shopDomain, accessToken: secret };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(secret);
  } catch {
    throw new Error("Stored Shopify client credentials are invalid");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Stored Shopify client credentials are invalid");
  }
  const values = parsed as Record<string, unknown>;
  if (typeof values.clientId !== "string" || typeof values.clientSecret !== "string") {
    throw new Error("Stored Shopify client credentials are invalid");
  }
  return {
    authMode: "client_credentials",
    shopDomain,
    clientId: values.clientId,
    clientSecret: values.clientSecret,
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
