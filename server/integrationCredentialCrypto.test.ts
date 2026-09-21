import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  decryptIntegrationCredential,
  encryptIntegrationCredential,
} from "./integrationCredentialCrypto";

const keys = [
  "INTEGRATION_CREDENTIAL_KEY",
  "JWT_SECRET",
  "CLERK_SECRET_KEY",
  "NODE_ENV",
] as const;
let previous: Record<string, string | undefined>;

beforeEach(() => {
  previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.NODE_ENV = "test";
  process.env.INTEGRATION_CREDENTIAL_KEY = "test-integration-key-with-at-least-32-bytes";
  delete process.env.JWT_SECRET;
  delete process.env.CLERK_SECRET_KEY;
});

afterEach(() => {
  for (const key of keys) {
    const value = previous[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function legacyEncrypt(plaintext: string, secret = process.env.INTEGRATION_CREDENTIAL_KEY!): string {
  const key = crypto
    .createHash("sha256")
    .update(secret)
    .digest();
  const iv = Buffer.alloc(16, 7);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  return `${iv.toString("hex")}:${cipher.update(plaintext, "utf8", "hex")}${cipher.final("hex")}`;
}

describe("integration credential encryption", () => {
  it("round-trips a credential through a versioned authenticated envelope", () => {
    const envelope = encryptIntegrationCredential("provider-secret-token");
    expect(envelope).toMatch(/^v2:/);
    expect(envelope).not.toContain("provider-secret-token");
    expect(decryptIntegrationCredential(envelope)).toBe("provider-secret-token");
  });

  it("rejects a tampered authenticated envelope", () => {
    const envelope = encryptIntegrationCredential("provider-secret-token");
    const parts = envelope.split(":");
    const ciphertext = Buffer.from(parts[3], "base64url");
    ciphertext[0] ^= 1;
    parts[3] = ciphertext.toString("base64url");
    expect(() => decryptIntegrationCredential(parts.join(":"))).toThrow();
  });

  it("keeps existing AES-CBC records readable during migration", () => {
    expect(decryptIntegrationCredential(legacyEncrypt("legacy-token"))).toBe("legacy-token");
  });

  it("tries a configured historical key after adding a dedicated primary key", () => {
    const previousJwtSecret = process.env.JWT_SECRET;
    try {
      process.env.JWT_SECRET = "historical-jwt-key-used-for-existing-records";
      const legacy = legacyEncrypt("historical-token", process.env.JWT_SECRET);
      expect(decryptIntegrationCredential(legacy)).toBe("historical-token");
    } finally {
      if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousJwtSecret;
    }
  });

  it("fails closed in production when no server encryption key exists", () => {
    process.env.NODE_ENV = "production";
    delete process.env.INTEGRATION_CREDENTIAL_KEY;
    delete process.env.JWT_SECRET;
    delete process.env.CLERK_SECRET_KEY;
    expect(() => encryptIntegrationCredential("secret")).toThrow(
      "Integration credential encryption is not configured",
    );
  });
});
