import { clerkMiddleware } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const CLERK_PROXY_PATH = "/__clerk";
const CLERK_FRONTEND_API = "https://frontend-api.clerk.dev";
const CLERK_COOKIE_NAMES = [
  "__session",
  "__clerk_db_jwt",
  "__client_uat",
  "__clerk_handshake",
];

function clearClerkCookies(res: Response) {
  for (const name of CLERK_COOKIE_NAMES) {
    res.clearCookie(name, { path: "/" });
    res.clearCookie(name, { path: "/", domain: ".quoratorium.com" });
  }
}

function markUnauthenticated(req: Request) {
  (req as any).auth = {
    userId: null,
    sessionId: null,
    sessionClaims: null,
  };
}

function originalClientIp(req: Request): string {
  const cloudflareIp = req.headers["cf-connecting-ip"];
  if (typeof cloudflareIp === "string" && cloudflareIp.trim()) {
    return cloudflareIp.trim();
  }
  return req.socket.remoteAddress || req.ip || "";
}

function publicProxyUrl(req: Request): string {
  const configured = process.env.CLERK_PROXY_URL?.replace(/\/$/, "");
  if (configured) return configured;

  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol =
    (typeof forwardedProto === "string"
      ? forwardedProto.split(",")[0]?.trim()
      : undefined) || req.protocol || "https";
  return `${protocol}://${req.get("host")}${CLERK_PROXY_PATH}`;
}

export function createClerkAppMiddleware() {
  const publishableKey =
    process.env.VITE_CLERK_PUBLISHABLE_KEY ||
    process.env.CLERK_PUBLISHABLE_KEY ||
    "";
  const secretKey = process.env.CLERK_SECRET_KEY || "";

  if (!publishableKey || !secretKey) {
    console.error("[Clerk] Server authentication keys are not configured.");
    return (req: Request, _res: Response, next: NextFunction) => {
      markUnauthenticated(req);
      next();
    };
  }

  const proxy = createProxyMiddleware<Request, Response>({
    target: CLERK_FRONTEND_API,
    changeOrigin: true,
    pathRewrite: {
      [`^${CLERK_PROXY_PATH}`]: "",
    },
    on: {
      proxyReq: (proxyReq, req) => {
        proxyReq.setHeader("Clerk-Proxy-Url", publicProxyUrl(req));
        proxyReq.setHeader("Clerk-Secret-Key", secretKey);
        proxyReq.setHeader("X-Forwarded-For", originalClientIp(req));
      },
      error: (error, _req, res) => {
        console.error("[Clerk] Frontend API proxy error:", error.message);
        if ("writeHead" in res && !res.headersSent) {
          res.writeHead(502, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: "Owner sign-in is temporarily unavailable.",
            }),
          );
        }
      },
    },
  });

  const authenticate = clerkMiddleware({
    publishableKey,
    secretKey,
    proxyUrl: CLERK_PROXY_PATH,
  });

  return (req: Request, res: Response, next: NextFunction) => {
    const isProxyRequest =
      req.path === CLERK_PROXY_PATH ||
      req.path.startsWith(`${CLERK_PROXY_PATH}/`);

    if (isProxyRequest) {
      return proxy(req, res, next);
    }

    const handleAuthenticationError = (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      const isStaleToken =
        message.includes("Handshake token verification failed") ||
        message.includes("Unable to find a signing key") ||
        message.includes("JWKS");

      if (isStaleToken) {
        console.warn("[Clerk] Clearing stale authentication cookies.");
        clearClerkCookies(res);
      } else {
        console.error("[Clerk] Middleware error:", message);
      }

      markUnauthenticated(req);
      next();
    };

    try {
      const possiblePromise = authenticate(req, res, (error?: unknown) => {
        if (error) return handleAuthenticationError(error);
        next();
      }) as unknown as Promise<void> | void;

      if (possiblePromise && typeof possiblePromise.catch === "function") {
        possiblePromise.catch(handleAuthenticationError);
      }
    } catch (error) {
      handleAuthenticationError(error);
    }
  };
}
