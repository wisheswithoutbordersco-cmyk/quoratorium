import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/express", () => ({
  clerkMiddleware: vi.fn(),
}));

import { clerkMiddleware } from "@clerk/express";
import { createClerkAppMiddleware } from "./clerkAppMiddleware";

function response() {
  const res: any = {
    headersSent: false,
    clearCookie: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CLERK_PUBLISHABLE_KEY = "pk_test_example";
  process.env.CLERK_SECRET_KEY = "sk_test_example_secret";
});

afterEach(() => {
  delete process.env.CLERK_PUBLISHABLE_KEY;
  delete process.env.VITE_CLERK_PUBLISHABLE_KEY;
  delete process.env.CLERK_SECRET_KEY;
});

describe("Clerk application middleware", () => {
  it("configures Clerk's same-origin Frontend API proxy on /__clerk", () => {
    vi.mocked(clerkMiddleware).mockReturnValue(
      ((req: any, _res: any, next: any) => {
        req.auth = { userId: "user_owner" };
        next();
      }) as any,
    );
    const middleware = createClerkAppMiddleware();
    const req: any = { path: "/api/trpc", auth: undefined };
    const next = vi.fn();

    middleware(req, response(), next);

    expect(clerkMiddleware).toHaveBeenCalledWith(
      expect.objectContaining({
        publishableKey: "pk_test_example",
        secretKey: "sk_test_example_secret",
        frontendApiProxy: { enabled: true, path: "/__clerk" },
      }),
    );
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.auth.userId).toBe("user_owner");
  });

  it("prefers the deployed browser key over a stale server placeholder", () => {
    process.env.CLERK_PUBLISHABLE_KEY = "pk_live_stale_generic";
    process.env.VITE_CLERK_PUBLISHABLE_KEY = "pk_live_clerk_quoratorium";
    vi.mocked(clerkMiddleware).mockReturnValue(
      ((_req: any, _res: any, next: any) => next()) as any,
    );

    createClerkAppMiddleware();

    expect(clerkMiddleware).toHaveBeenCalledWith(
      expect.objectContaining({
        publishableKey: "pk_live_clerk_quoratorium",
        frontendApiProxy: { enabled: true, path: "/__clerk" },
      }),
    );
  });

  it("fails closed as unauthenticated when server keys are missing", () => {
    delete process.env.CLERK_PUBLISHABLE_KEY;
    delete process.env.CLERK_SECRET_KEY;
    const middleware = createClerkAppMiddleware();
    const req: any = { path: "/api/trpc" };
    const next = vi.fn();

    middleware(req, response(), next);

    expect(clerkMiddleware).not.toHaveBeenCalled();
    expect(req.auth.userId).toBeNull();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("returns a controlled 502 for proxy failure without continuing", () => {
    vi.mocked(clerkMiddleware).mockReturnValue(
      ((_req: any, _res: any, next: any) =>
        next(new Error("proxy unavailable"))) as any,
    );
    const middleware = createClerkAppMiddleware();
    const req: any = { path: "/__clerk/v1/client" };
    const res = response();
    const next = vi.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith({
      error: "Owner sign-in is temporarily unavailable.",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("clears stale cookies and lets ordinary requests continue unauthenticated", () => {
    vi.mocked(clerkMiddleware).mockReturnValue(
      ((_req: any, _res: any, next: any) =>
        next(new Error("JWKS signing key mismatch"))) as any,
    );
    const middleware = createClerkAppMiddleware();
    const req: any = { path: "/api/trpc" };
    const res = response();
    const next = vi.fn();

    middleware(req, res, next);

    expect(req.auth.userId).toBeNull();
    expect(res.clearCookie).toHaveBeenCalledWith("__session", { path: "/" });
    expect(next).toHaveBeenCalledTimes(1);
  });
});
