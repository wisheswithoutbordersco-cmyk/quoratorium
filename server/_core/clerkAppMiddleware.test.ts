import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/express", () => ({
  clerkMiddleware: vi.fn(),
}));

vi.mock("http-proxy-middleware", () => ({
  createProxyMiddleware: vi.fn(),
}));

import { clerkMiddleware } from "@clerk/express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { createClerkAppMiddleware } from "./clerkAppMiddleware";

function response() {
  const res: any = {
    headersSent: false,
    clearCookie: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
    writeHead: vi.fn(),
    end: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

function request(path = "/api/trpc") {
  return {
    path,
    protocol: "https",
    ip: "10.0.0.10",
    socket: { remoteAddress: "10.0.0.11" },
    headers: {
      host: "quoratorium.com",
      "x-forwarded-proto": "https",
      "cf-connecting-ip": "203.0.113.7",
    },
    get: vi.fn((name: string) =>
      name.toLowerCase() === "host" ? "quoratorium.com" : undefined,
    ),
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CLERK_PUBLISHABLE_KEY = "pk_test_example";
  process.env.CLERK_SECRET_KEY = "sk_test_example_secret";
  vi.mocked(createProxyMiddleware).mockReturnValue(vi.fn() as any);
  vi.mocked(clerkMiddleware).mockReturnValue(
    ((_req: any, _res: any, next: any) => next()) as any,
  );
});

afterEach(() => {
  delete process.env.CLERK_PUBLISHABLE_KEY;
  delete process.env.VITE_CLERK_PUBLISHABLE_KEY;
  delete process.env.CLERK_SECRET_KEY;
  delete process.env.CLERK_PROXY_URL;
});

describe("Clerk application middleware", () => {
  it("targets Clerk's documented proxy host and authenticates against /__clerk", () => {
    createClerkAppMiddleware();

    expect(createProxyMiddleware).toHaveBeenCalledWith(
      expect.objectContaining({
        target: "https://frontend-api.clerk.dev",
        changeOrigin: true,
        pathRewrite: { "^/__clerk": "" },
      }),
    );
    expect(clerkMiddleware).toHaveBeenCalledWith(
      expect.objectContaining({
        publishableKey: "pk_test_example",
        secretKey: "sk_test_example_secret",
        proxyUrl: "/__clerk",
      }),
    );
  });

  it("adds Clerk's required proxy URL, secret, and original Cloudflare client IP", () => {
    createClerkAppMiddleware();
    const options = vi.mocked(createProxyMiddleware).mock.calls[0]?.[0] as any;
    const proxyReq = { setHeader: vi.fn() };

    options.on.proxyReq(proxyReq, request("/__clerk/v1/client"));

    expect(proxyReq.setHeader).toHaveBeenCalledWith(
      "Clerk-Proxy-Url",
      "https://quoratorium.com/__clerk",
    );
    expect(proxyReq.setHeader).toHaveBeenCalledWith(
      "Clerk-Secret-Key",
      "sk_test_example_secret",
    );
    expect(proxyReq.setHeader).toHaveBeenCalledWith(
      "X-Forwarded-For",
      "203.0.113.7",
    );
  });

  it("sends only /__clerk requests through the proxy", () => {
    const proxy = vi.fn();
    const authenticate = vi.fn((_req: any, _res: any, next: any) => next());
    vi.mocked(createProxyMiddleware).mockReturnValue(proxy as any);
    vi.mocked(clerkMiddleware).mockReturnValue(authenticate as any);
    const middleware = createClerkAppMiddleware();
    const next = vi.fn();

    middleware(request("/__clerk/v1/client"), response(), next);

    expect(proxy).toHaveBeenCalledTimes(1);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("prefers the deployed browser key over a stale server placeholder", () => {
    process.env.CLERK_PUBLISHABLE_KEY = "pk_live_stale_generic";
    process.env.VITE_CLERK_PUBLISHABLE_KEY = "pk_live_clerk_quoratorium";

    createClerkAppMiddleware();

    expect(clerkMiddleware).toHaveBeenCalledWith(
      expect.objectContaining({
        publishableKey: "pk_live_clerk_quoratorium",
      }),
    );
  });

  it("fails closed as unauthenticated when server keys are missing", () => {
    delete process.env.CLERK_PUBLISHABLE_KEY;
    delete process.env.CLERK_SECRET_KEY;
    const middleware = createClerkAppMiddleware();
    const req = request();
    const next = vi.fn();

    middleware(req, response(), next);

    expect(createProxyMiddleware).not.toHaveBeenCalled();
    expect(clerkMiddleware).not.toHaveBeenCalled();
    expect(req.auth.userId).toBeNull();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("returns a controlled 502 when the proxy target is unavailable", () => {
    createClerkAppMiddleware();
    const options = vi.mocked(createProxyMiddleware).mock.calls[0]?.[0] as any;
    const res = response();

    options.on.error(new Error("proxy unavailable"), request(), res);

    expect(res.writeHead).toHaveBeenCalledWith(502, {
      "Content-Type": "application/json",
    });
    expect(res.end).toHaveBeenCalledWith(
      JSON.stringify({
        error: "Owner sign-in is temporarily unavailable.",
      }),
    );
  });

  it("clears stale cookies and lets ordinary requests continue unauthenticated", () => {
    vi.mocked(clerkMiddleware).mockReturnValue(
      ((_req: any, _res: any, next: any) =>
        next(new Error("JWKS signing key mismatch"))) as any,
    );
    const middleware = createClerkAppMiddleware();
    const req = request();
    const res = response();
    const next = vi.fn();

    middleware(req, res, next);

    expect(req.auth.userId).toBeNull();
    expect(res.clearCookie).toHaveBeenCalledWith("__session", { path: "/" });
    expect(next).toHaveBeenCalledTimes(1);
  });
});
