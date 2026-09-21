import {
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import type { Request, Response } from "express";

const COOKIE_NAME = "q_owner_access";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_WINDOW = 5;

interface AttemptState {
  count: number;
  resetAt: number;
}

export interface OwnerAccessSession {
  ownerId: number;
  expiresAt: number;
  nonce: string;
}

const attempts = new Map<string, AttemptState>();

function configuredCode(): string {
  return (process.env.OWNER_ACCESS_CODE || process.env.BUSINESS_ACTION_PIN || "").trim();
}

function signingSecret(): string {
  return (
    process.env.OWNER_ACCESS_SESSION_SECRET ||
    process.env.BUSINESS_ACTION_SESSION_SECRET ||
    process.env.BUSINESS_CREDENTIAL_KEY ||
    process.env.CLERK_SECRET_KEY ||
    ""
  );
}

function codeDigest(value: string): Buffer {
  const salt = createHash("sha256")
    .update(`quoratorium-owner-access:${signingSecret()}`)
    .digest();
  return scryptSync(value, salt, 32);
}

function signature(payload: string): string {
  return createHmac("sha256", signingSecret())
    .update(payload)
    .digest("base64url");
}

function parseCookies(req: Request): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const part of (req.headers.cookie || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key) parsed[key] = decodeURIComponent(value);
  }
  return parsed;
}

function requestIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function consumeAttempt(req: Request): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  attempts.forEach((state, key) => {
    if (state.resetAt <= now) attempts.delete(key);
  });

  const key = requestIp(req);
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.count >= MAX_ATTEMPTS_PER_WINDOW) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

function encodeSession(payload: OwnerAccessSession): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${signature(encoded)}`;
}

function decodeSession(token: string): OwnerAccessSession | null {
  const [encoded, receivedSignature] = token.split(".");
  if (!encoded || !receivedSignature) return null;

  const expectedSignature = signature(encoded);
  const received = Buffer.from(receivedSignature);
  const expected = Buffer.from(expectedSignature);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as OwnerAccessSession;
    if (
      !Number.isInteger(payload.ownerId) ||
      payload.ownerId <= 0 ||
      !Number.isFinite(payload.expiresAt) ||
      payload.expiresAt <= Date.now() ||
      typeof payload.nonce !== "string"
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function isOwnerAccessConfigured(): boolean {
  const minimumSecretLength = process.env.NODE_ENV === "production" ? 32 : 8;
  return configuredCode().length >= 8 && signingSecret().length >= minimumSecretLength;
}

export function verifyOwnerAccessCode(
  req: Request,
  suppliedCode: string,
): { ok: boolean; retryAfterSeconds?: number } {
  if (!isOwnerAccessConfigured()) return { ok: false };

  const attempt = consumeAttempt(req);
  if (!attempt.allowed) {
    return { ok: false, retryAfterSeconds: attempt.retryAfterSeconds };
  }

  const ok = timingSafeEqual(codeDigest(suppliedCode.trim()), codeDigest(configuredCode()));
  if (ok) attempts.delete(requestIp(req));
  return { ok };
}

export function startOwnerAccessSession(
  res: Response,
  ownerId: number,
): { expiresAt: string } {
  if (!isOwnerAccessConfigured()) {
    throw new Error("Owner access session signing is not configured");
  }
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const token = encodeSession({
    ownerId,
    expiresAt,
    nonce: randomBytes(16).toString("base64url"),
  });

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_MS,
  });

  return { expiresAt: new Date(expiresAt).toISOString() };
}

export function clearOwnerAccessSession(res: Response): void {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  });
}

export function getOwnerAccessSession(req: Request): OwnerAccessSession | null {
  if (!isOwnerAccessConfigured()) return null;
  const token = parseCookies(req)[COOKIE_NAME];
  return token ? decodeSession(token) : null;
}

export function resetOwnerAccessAuthForTests(): void {
  attempts.clear();
}
