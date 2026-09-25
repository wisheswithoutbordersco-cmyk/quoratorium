import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const TOOL_LAUNCH_TTL_MS = 90_000;

export const TOOL_LAUNCH_TARGETS = {
  templatorium: "https://templatorium-production.up.railway.app/launch",
  extractorium: "https://extractorium-production.up.railway.app/launch",
} as const;

export type ToolLaunchTarget = keyof typeof TOOL_LAUNCH_TARGETS;

type ToolLaunchTicket = {
  version: 1;
  audience: ToolLaunchTarget;
  subject: number;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
};

function signingSecret(target: ToolLaunchTarget): string {
  return (
    process.env[`QUORATORIUM_${target.toUpperCase()}_SSO_SECRET`] ?? ""
  ).trim();
}

export function isToolLaunchConfigured(target: ToolLaunchTarget): boolean {
  return signingSecret(target).length >= 32;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function equalSignature(expected: string, presented: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const presentedBuffer = Buffer.from(presented);
  return (
    expectedBuffer.length === presentedBuffer.length &&
    timingSafeEqual(expectedBuffer, presentedBuffer)
  );
}

export function issueToolLaunchTicket(
  target: ToolLaunchTarget,
  subject: number,
  now = Date.now()
): string {
  const secret = signingSecret(target);
  if (!isToolLaunchConfigured(target)) {
    throw new Error(`Quoratorium SSO is not configured for ${target}.`);
  }
  if (!Number.isSafeInteger(subject) || subject <= 0) {
    throw new Error("An authenticated owner is required to launch this tool.");
  }

  const payload: ToolLaunchTicket = {
    version: 1,
    audience: target,
    subject,
    issuedAt: now,
    expiresAt: now + TOOL_LAUNCH_TTL_MS,
    nonce: randomBytes(16).toString("base64url"),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url"
  );
  return `${encoded}.${sign(encoded, secret)}`;
}

export function launchUrlFor(
  target: ToolLaunchTarget,
  subject: number,
  now = Date.now()
): string {
  const ticket = issueToolLaunchTicket(target, subject, now);
  // Keep the credential in the fragment: browsers do not send it in requests,
  // referers, CDN logs, or static asset requests. The target exchanges it once
  // through a same-origin POST and replaces the history entry immediately.
  return `${TOOL_LAUNCH_TARGETS[target]}#ticket=${encodeURIComponent(ticket)}`;
}

/** Exported for cross-app contract tests; tool services repeat this verifier. */
export function verifyToolLaunchTicket(
  ticket: string,
  target: ToolLaunchTarget,
  secret: string,
  now = Date.now()
): ToolLaunchTicket | null {
  const [encoded, presentedSignature, ...extra] = ticket.split(".");
  if (!encoded || !presentedSignature || extra.length > 0) return null;
  if (!equalSignature(sign(encoded, secret), presentedSignature)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    ) as ToolLaunchTicket;
    if (
      payload.version !== 1 ||
      payload.audience !== target ||
      !Number.isSafeInteger(payload.subject) ||
      payload.subject <= 0 ||
      !Number.isSafeInteger(payload.issuedAt) ||
      !Number.isSafeInteger(payload.expiresAt) ||
      payload.expiresAt <= now ||
      payload.expiresAt - payload.issuedAt > TOOL_LAUNCH_TTL_MS ||
      typeof payload.nonce !== "string" ||
      payload.nonce.length < 16
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
