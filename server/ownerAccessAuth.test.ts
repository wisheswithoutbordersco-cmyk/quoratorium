import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearOwnerAccessSession,
  getOwnerAccessSession,
  isOwnerAccessConfigured,
  resetOwnerAccessAuthForTests,
  startOwnerAccessSession,
  verifyOwnerAccessCode,
} from "./ownerAccessAuth";

beforeEach(() => {
  resetOwnerAccessAuthForTests();
  process.env.OWNER_ACCESS_CODE = "owner-access-47";
  process.env.OWNER_ACCESS_SESSION_SECRET =
    "test-owner-session-secret-with-entropy";
});

function request(cookie = "") {
  return {
    headers: { cookie },
    socket: { remoteAddress: "127.0.0.1" },
    ip: "127.0.0.1",
  } as any;
}

describe("owner access authentication", () => {
  it("verifies the configured access code without exposing it", () => {
    expect(isOwnerAccessConfigured()).toBe(true);
    expect(verifyOwnerAccessCode(request(), "owner-access-47")).toEqual({
      ok: true,
    });
    expect(verifyOwnerAccessCode(request(), "wrong-access-code")).toEqual({
      ok: false,
    });
  });

  it("creates a signed HTTP-only session and rejects tampering", () => {
    const res = { cookie: vi.fn(), clearCookie: vi.fn() } as any;
    startOwnerAccessSession(res, 42);
    const [name, token, options] = res.cookie.mock.calls[0];
    expect(options).toMatchObject({
      httpOnly: true,
      sameSite: "strict",
      path: "/",
    });
    const cookie = `${name}=${encodeURIComponent(token)}`;
    expect(getOwnerAccessSession(request(cookie))).toMatchObject({
      ownerId: 42,
    });
    const tampered = `${name}=${encodeURIComponent(`${token}x`)}`;
    expect(getOwnerAccessSession(request(tampered))).toBeNull();
  });

  it("clears the owner access cookie on logout", () => {
    const res = { clearCookie: vi.fn() } as any;
    clearOwnerAccessSession(res);
    expect(res.clearCookie).toHaveBeenCalledWith(
      "q_owner_access",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "strict",
        path: "/",
      })
    );
  });

  it("requires an independent high-entropy signing secret in production", () => {
    const keys = ["OWNER_ACCESS_SESSION_SECRET", "NODE_ENV"] as const;
    const previous = Object.fromEntries(
      keys.map(key => [key, process.env[key]])
    );
    try {
      process.env.NODE_ENV = "production";
      delete process.env.OWNER_ACCESS_SESSION_SECRET;
      expect(isOwnerAccessConfigured()).toBe(false);
      expect(verifyOwnerAccessCode(request(), "owner-access-47")).toEqual({
        ok: false,
      });
      expect(() =>
        startOwnerAccessSession({ cookie: vi.fn() } as any, 42)
      ).toThrow("Owner access session signing is not configured");
    } finally {
      for (const key of keys) {
        const value = previous[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
