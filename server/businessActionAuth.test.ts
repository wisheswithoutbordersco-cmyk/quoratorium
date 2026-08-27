import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getBusinessActionSession,
  isBusinessActionPinConfigured,
  resetBusinessActionAuthForTests,
  startBusinessActionSession,
  verifyBusinessActionPin,
} from "./businessActionAuth";

function request(options: { cookie?: string; ip?: string } = {}) {
  return {
    headers: {
      cookie: options.cookie || "",
      "cf-connecting-ip": options.ip || "203.0.113.12",
    },
    socket: { remoteAddress: "10.0.0.4" },
    ip: "10.0.0.4",
  } as any;
}

function response() {
  return {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  } as any;
}

beforeEach(() => {
  resetBusinessActionAuthForTests();
  process.env.BUSINESS_ACTION_PIN = "correct-horse-47";
  process.env.BUSINESS_ACTION_SESSION_SECRET = "test-session-secret-with-entropy";
  process.env.NODE_ENV = "production";
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.BUSINESS_ACTION_PIN;
  delete process.env.BUSINESS_ACTION_SESSION_SECRET;
});

describe("business action owner session", () => {
  it("requires a sufficiently long server-side owner code", () => {
    expect(isBusinessActionPinConfigured()).toBe(true);
    process.env.BUSINESS_ACTION_PIN = "short";
    expect(isBusinessActionPinConfigured()).toBe(false);
  });

  it("verifies the owner code without returning or storing it in a session", () => {
    expect(verifyBusinessActionPin(request(), "wrong-code").ok).toBe(false);
    expect(verifyBusinessActionPin(request(), "correct-horse-47").ok).toBe(true);
  });

  it("rate limits repeated failed guesses by the original client IP", () => {
    const req = request({ ip: "198.51.100.8" });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(verifyBusinessActionPin(req, `wrong-code-${attempt}`).ok).toBe(false);
    }
    const blocked = verifyBusinessActionPin(req, "correct-horse-47");
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("issues an HTTP-only strict secure cookie and accepts it only for its owner", () => {
    const res = response();
    startBusinessActionSession(res, 42);

    expect(res.cookie).toHaveBeenCalledTimes(1);
    const [name, token, options] = res.cookie.mock.calls[0];
    expect(name).toBe("q_action_session");
    expect(token).not.toContain("correct-horse-47");
    expect(options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
    });

    const req = request({ cookie: `${name}=${encodeURIComponent(token)}` });
    expect(getBusinessActionSession(req, 42)?.ownerId).toBe(42);
    expect(getBusinessActionSession(req, 99)).toBeNull();
  });

  it("rejects tampered and expired session cookies", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-27T22:00:00Z"));
    const res = response();
    startBusinessActionSession(res, 7);
    const [name, token] = res.cookie.mock.calls[0];

    const tampered = request({ cookie: `${name}=${token}x` });
    expect(getBusinessActionSession(tampered, 7)).toBeNull();

    const valid = request({ cookie: `${name}=${encodeURIComponent(token)}` });
    expect(getBusinessActionSession(valid, 7)).not.toBeNull();
    vi.advanceTimersByTime(31 * 60 * 1000);
    expect(getBusinessActionSession(valid, 7)).toBeNull();
  });
});
