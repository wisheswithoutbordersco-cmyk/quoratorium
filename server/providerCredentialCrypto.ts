import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const FORMAT_PREFIX = "qcred:v1";
const MINIMUM_SECRET_LENGTH = 16;

export class ProviderCredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderCredentialError";
  }
}

export interface DecryptedProviderCredential {
  value: string;
  needsRotation: boolean;
}

interface SecretCandidate {
  value: string;
  current: boolean;
}

function normalizeSecret(value: string | undefined): string | null {
  const secret = value?.trim() || "";
  return secret.length >= MINIMUM_SECRET_LENGTH ? secret : null;
}

function currentSecret(): string {
  const secret =
    normalizeSecret(process.env.PROVIDER_CREDENTIAL_KEY) ||
    normalizeSecret(process.env.BUSINESS_CREDENTIAL_KEY) ||
    normalizeSecret(process.env.JWT_SECRET);
  if (!secret) {
    throw new ProviderCredentialError(
      "Provider credential encryption is not configured. Set PROVIDER_CREDENTIAL_KEY to a stable secret of at least 16 characters."
    );
  }
  return secret;
}

function secretCandidates(): SecretCandidate[] {
  const candidates: SecretCandidate[] = [];
  const seen = new Set<string>();
  const add = (value: string | undefined, current: boolean) => {
    const normalized = normalizeSecret(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push({ value: normalized, current });
  };

  add(currentSecret(), true);
  add(process.env.PROVIDER_CREDENTIAL_KEY, false);
  add(process.env.BUSINESS_CREDENTIAL_KEY, false);
  add(process.env.JWT_SECRET, false);
  add(process.env.PROVIDER_CREDENTIAL_LEGACY_KEY, false);

  if (process.env.NODE_ENV !== "production") {
    add("fallback-secret-key-for-dev-only", false);
  }
  return candidates;
}

function deriveKey(secret: string, purpose: string, format: "v1" | "legacy") {
  const domain =
    format === "v1"
      ? `quoratorium-provider-credential-v1:${purpose}:`
      : "";
  return createHash("sha256").update(`${domain}${secret}`).digest();
}

function decryptVersioned(
  stored: string,
  purpose: string,
  candidate: SecretCandidate
): string {
  const parts = stored.split(":");
  if (parts.length !== 6 || `${parts[0]}:${parts[1]}` !== FORMAT_PREFIX) {
    throw new Error("Unsupported provider credential format");
  }
  const [, , storedPurpose, ivValue, authTagValue, ciphertextValue] = parts;
  if (storedPurpose !== purpose) {
    throw new Error("Provider credential purpose mismatch");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveKey(candidate.value, purpose, "v1"),
    Buffer.from(ivValue, "base64url")
  );
  decipher.setAAD(Buffer.from(`${FORMAT_PREFIX}:${purpose}`, "utf8"));
  decipher.setAuthTag(Buffer.from(authTagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function decryptLegacy(stored: string, candidate: SecretCandidate): string {
  const [ivHex, ciphertextHex, ...extra] = stored.split(":");
  if (
    extra.length > 0 ||
    !/^[a-f0-9]{32}$/i.test(ivHex || "") ||
    !/^(?:[a-f0-9]{32})+$/i.test(ciphertextHex || "")
  ) {
    throw new Error("Unsupported legacy provider credential format");
  }
  const decipher = createDecipheriv(
    "aes-256-cbc",
    deriveKey(candidate.value, "", "legacy"),
    Buffer.from(ivHex, "hex")
  );
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

export function encryptProviderCredential(
  value: string,
  purpose: string
): string {
  if (!value) throw new ProviderCredentialError("Credential cannot be empty");
  if (!/^[a-z][a-z0-9_-]{1,31}$/i.test(purpose)) {
    throw new ProviderCredentialError("Credential purpose is invalid");
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    deriveKey(currentSecret(), purpose, "v1"),
    iv
  );
  cipher.setAAD(Buffer.from(`${FORMAT_PREFIX}:${purpose}`, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [
    FORMAT_PREFIX,
    purpose,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptProviderCredential(
  stored: string,
  purpose: string
): DecryptedProviderCredential {
  const versioned = stored.startsWith(`${FORMAT_PREFIX}:`);
  for (const candidate of secretCandidates()) {
    try {
      const value = versioned
        ? decryptVersioned(stored, purpose, candidate)
        : decryptLegacy(stored, candidate);
      return {
        value,
        needsRotation: !versioned || !candidate.current,
      };
    } catch {
      // Try the next configured current or legacy key.
    }
  }

  throw new ProviderCredentialError(
    "The saved credential can no longer be decrypted. Reconnect this provider in Settings. If the previous encryption secret is available, set it temporarily as PROVIDER_CREDENTIAL_LEGACY_KEY to migrate the credential."
  );
}

export function isProviderCredentialError(
  error: unknown
): error is ProviderCredentialError {
  return error instanceof ProviderCredentialError;
}
