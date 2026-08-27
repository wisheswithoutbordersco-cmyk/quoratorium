import { clerkMiddleware } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";

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

export function createClerkAppMiddleware() {
  const publishableKey = process.env.CLERK_PUBLISHABLE_KEY ||
    process.env.VITE_CLERK_PUBLISHABLE_KEY || "";
  const secretKey = process.env.CLERK_SECRET_KEY || "";

  if (!publishableKey || !secretKey) {
    console.error("[Clerk] Server authentication keys are not configured.");
    return (req: Request, _res: Response, next: NextFunction) => {
      markUnauthenticated(req);
      next();
    };
  }

  const clerk = clerkMiddleware({
    publishableKey,
    secretKey,
    frontendApiProxy: {
      enabled: true,
      path: "/__clerk",
    },
  });

  return (req: Request, res: Response, next: NextFunction) => {
    const handleError = (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      const isProxyRequest = req.path === "/__clerk" || req.path.startsWith("/__clerk/");
      if (isProxyRequest) {
        console.error("[Clerk] Frontend API proxy error:", message);
        if (!res.headersSent) {
          res.status(502).json({ error: "Owner sign-in is temporarily unavailable." });
        }
        return;
      }

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
      const possiblePromise = clerk(req, res, (error?: unknown) => {
        if (error) return handleError(error);
        next();
      }) as unknown as Promise<void> | void;
      if (possiblePromise && typeof possiblePromise.catch === "function") {
        possiblePromise.catch(handleError);
      }
    } catch (error) {
      handleError(error);
    }
  };
}
