import {
  createCipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  decryptProviderCredential,
  encryptProviderCredential,
  ProviderCredentialError,
} from "./providerCredentialCrypto";

function legacyEncrypt(value: string, secret: string): string {
  const iv = randomBytes(16);
  const key = createHash("sha256").update(secret).digest();
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  PROVIDER_CREDENTIAL_KEY: process.env.PROVIDER_CREDENTIAL_KEY,
  PROVIDER_CREDENTIAL_LEGACY_KEY:
    process.env.PROVIDER_CREDENTIAL_LEGACY_KEY,
  BUSINESS_CREDENTIAL_KEY: process.env.BUSINESS_CREDENTIAL_KEY,
  JWT_SECRET: process.env.JWT_SECRET,
};

beforeEach(() => {
  process.env.NODE_ENV = "test";
  process.env.PROVIDER_CREDENTIAL_KEY =
    "stable-provider-credential-key-material";
  delete process.env.PROVIDER_CREDENTIAL_LEGACY_KEY;
  delete process.env.BUSINESS_CREDENTIAL_KEY;
  process.env.JWT_SECRET = "session-secret-that-may-rotate";
});

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("provider credential encryption", () => {
  it("keeps credentials readable when JWT_SECRET rotates", () => {
    const stored = encryptProviderCredential("github-secret-token", "github");
    process.env.JWT_SECRET = "a-completely-different-session-secret";

    expect(decryptProviderCredential(stored, "github")).toEqual({
      value: "github-secret-token",
      needsRotation: false,
    });
  });

  it("authenticates the provider purpose and ciphertext", () => {
    const stored = encryptProviderCredential("provider-secret-token", "github");
    expect(() => decryptProviderCredential(stored, "railway")).toThrow(
      ProviderCredentialError
    );

    const tampered = `${stored.slice(0, -1)}${stored.endsWith("A") ? "B" : "A"}`;
    expect(() => decryptProviderCredential(tampered, "github")).toThrow(
      ProviderCredentialError
    );
  });

  it("reads a legacy JWT-encrypted value and marks it for rotation", () => {
    const legacySecret = "previous-jwt-secret-used-for-provider-tokens";
    const stored = legacyEncrypt("legacy-github-token", legacySecret);
    process.env.PROVIDER_CREDENTIAL_LEGACY_KEY = legacySecret;

    expect(decryptProviderCredential(stored, "github")).toEqual({
      value: "legacy-github-token",
      needsRotation: true,
    });
  });

  it("fails with reconnect guidance when no configured key can decrypt", () => {
    const stored = legacyEncrypt(
      "unrecoverable-token",
      "unknown-previous-session-secret"
    );

    expect(() => decryptProviderCredential(stored, "github")).toThrow(
      /Reconnect this provider in Settings/
    );
  });
});
