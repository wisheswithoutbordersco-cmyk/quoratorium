import {
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import type { Request, Response } from "express";

const COOKIE_NAME = "q_action_session";
const SESSION_TTL_MS = 30 * 60 * 1000;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_WINDOW = 5;

interface AttemptState {
  count: number;
  resetAt: number;
}

interface SessionPayload {
  ownerId: number;
  expiresAt: number;
  nonce: string;
}

const attempts = new Map<string, AttemptState>();

function configuredCode(): string {
  return (process.env.BUSINESS_ACTION_PIN || "").trim();
}

function signingSecret(): string {
  return (
    process.env.BUSINESS_ACTION_SESSION_SECRET ||
    process.env.BUSINESS_CREDENTIAL_KEY ||
    process.env.CLERK_SECRET_KEY ||
    configuredCode()
  );
}

function codeDigest(value: string): Buffer {
  const salt = createHash("sha256")
    .update(`quoratorium-business-action:${signingSecret()}`)
    .digest();
  return scryptSync(value, salt, 32);
}

function signature(payload: string): string {
  return createHmac("sha256", signingSecret())
    .update(payload)
    .digest("base64url");
}

function parseCookies(req: Request): Record<string, string> {
  const cookieHeader = req.headers.cookie || "";
  const parsed: Record<string, string> = {};
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key) parsed[key] = decodeURIComponent(value);
  }
  return parsed;
}

function requestIp(req: Request): string {
  const cloudflareIp = req.headers["cf-connecting-ip"];
  if (typeof cloudflareIp === "string" && cloudflareIp.trim()) {
    return cloudflareIp.trim();
  }
  return req.socket.remoteAddress || req.ip || "unknown";
}

function clearExpiredAttempts(now: number) {
  for (const [key, state] of Array.from(attempts.entries())) {
    if (state.resetAt <= now) attempts.delete(key);
  }
}

function consumeAttempt(req: Request): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  clearExpiredAttempts(now);
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

function resetAttempts(req: Request) {
  attempts.delete(requestIp(req));
}

function encodeSession(payload: SessionPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${signature(encoded)}`;
}

function decodeSession(token: string): SessionPayload | null {
  const [encoded, receivedSignature] = token.split(".");
  if (!encoded || !receivedSignature) return null;

  const expectedSignature = signature(encoded);
  const received = Buffer.from(receivedSignature);
  const expected = Buffer.from(expectedSignature);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as SessionPayload;
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

export function isBusinessActionPinConfigured(): boolean {
  return configuredCode().length >= 8 && signingSecret().length >= 8;
}

export function verifyBusinessActionPin(
  req: Request,
  suppliedCode: string,
): { ok: boolean; retryAfterSeconds?: number } {
  if (!isBusinessActionPinConfigured()) return { ok: false };

  const attempt = consumeAttempt(req);
  if (!attempt.allowed) {
    return { ok: false, retryAfterSeconds: attempt.retryAfterSeconds };
  }

  const supplied = codeDigest(suppliedCode.trim());
  const expected = codeDigest(configuredCode());
  const ok = timingSafeEqual(supplied, expected);
  if (ok) resetAttempts(req);
  return { ok };
}

export function startBusinessActionSession(
  res: Response,
  ownerId: number,
): { expiresAt: string } {
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

export function clearBusinessActionSession(res: Response) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  });
}

export function getBusinessActionSession(
  req: Request,
  ownerId: number,
): SessionPayload | null {
  if (!isBusinessActionPinConfigured()) return null;
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) return null;
  const payload = decodeSession(token);
  if (!payload || payload.ownerId !== ownerId) return null;
  return payload;
}

export const BUSINESS_ACTION_SESSION_TTL_MINUTES =
  SESSION_TTL_MS / 60_000;

export function resetBusinessActionAuthForTests() {
  attempts.clear();
}
