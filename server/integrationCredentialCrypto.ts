import crypto from "node:crypto";

const GCM_PREFIX = "v2";
const GCM_IV_BYTES = 12;

function encryptionKeys(): Buffer[] {
  const secrets = [
    process.env.INTEGRATION_CREDENTIAL_KEY,
    process.env.JWT_SECRET,
    process.env.CLERK_SECRET_KEY,
  ].filter((value): value is string => Boolean(value));

  if (secrets.length === 0 && process.env.NODE_ENV === "production") {
    throw new Error("Integration credential encryption is not configured");
  }

  const uniqueSecrets = Array.from(new Set(
    secrets.length > 0 ? secrets : ["development-only-integration-key"],
  ));
  return uniqueSecrets.map(secret =>
    crypto.createHash("sha256").update(secret).digest(),
  );
}

function primaryEncryptionKey(): Buffer {
  return encryptionKeys()[0];
}

/**
 * Encrypt new credentials with AES-256-GCM. The versioned envelope allows
 * future key/cipher migrations without misinterpreting existing records.
 */
export function encryptIntegrationCredential(plaintext: string): string {
  const iv = crypto.randomBytes(GCM_IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", primaryEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    GCM_PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

/**
 * Decrypt current GCM envelopes and legacy `ivHex:ciphertextHex` AES-CBC
 * records. Legacy support prevents existing connections from breaking; the
 * next successful reconnect rewrites them in the authenticated v2 format.
 */
export function decryptIntegrationCredential(envelope: string): string {
  if (envelope.startsWith(`${GCM_PREFIX}:`)) {
    const parts = envelope.split(":");
    if (parts.length !== 4) throw new Error("Invalid integration credential envelope");

    const [, ivEncoded, tagEncoded, ciphertextEncoded] = parts;
    const iv = Buffer.from(ivEncoded, "base64url");
    const tag = Buffer.from(tagEncoded, "base64url");
    const ciphertext = Buffer.from(ciphertextEncoded, "base64url");

    if (iv.length !== GCM_IV_BYTES || tag.length !== 16 || ciphertext.length === 0) {
      throw new Error("Invalid integration credential envelope");
    }

    for (const key of encryptionKeys()) {
      try {
        const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([
          decipher.update(ciphertext),
          decipher.final(),
        ]).toString("utf8");
      } catch {
        // Try the next configured historical key.
      }
    }
    throw new Error("Unable to decrypt integration credential");
  }

  const [ivHex, ciphertextHex, ...extra] = envelope.split(":");
  if (
    extra.length > 0 ||
    !ivHex ||
    !ciphertextHex ||
    !/^[0-9a-f]+$/i.test(ivHex) ||
    !/^[0-9a-f]+$/i.test(ciphertextHex)
  ) {
    throw new Error("Invalid integration credential envelope");
  }

  const iv = Buffer.from(ivHex, "hex");
  if (iv.length !== 16) throw new Error("Invalid integration credential envelope");

  for (const key of encryptionKeys()) {
    try {
      const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
      return decipher.update(ciphertextHex, "hex", "utf8") + decipher.final("utf8");
    } catch {
      // Try the next configured historical key.
    }
  }
  throw new Error("Unable to decrypt integration credential");
}
