import * as Sentry from "@sentry/node";

// Initialize Sentry BEFORE anything else
Sentry.init({
  dsn: process.env.SENTRY_DSN || "",
  environment: process.env.NODE_ENV || "production",
  tracesSampleRate: 0.2,
  beforeSend(event) {
    // Don't send events if DSN is empty
    if (!process.env.SENTRY_DSN) return null;
    return event;
  },
});

import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { clerkMiddleware } from "@clerk/express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { registerStorageProxy } from "./storageProxy";
import { registerStreamingRoutes } from "../streaming";
import { registerSandboxRoutes } from "../sandbox/routes";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { clerkWebhookRouter } from "../webhooks/clerk";
import { stripeWebhookRouter } from "../webhooks/stripe";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let cqRouter: any = null;
try {
  // Try multiple paths since build output is in dist/ but source is in server/
  const possiblePaths = [
    path.resolve(__dirname, '../server/captain-q-v2.cjs'),
    path.resolve(__dirname, './captain-q-v2.cjs'),
    path.resolve(__dirname, '../captain-q-v2.cjs'),
    path.resolve(process.cwd(), 'server/captain-q-v2.cjs'),
  ];
  let loaded = false;
  for (const p of possiblePaths) {
    try {
      const cqModule = require(p);
      cqRouter = cqModule.router;
      console.log('[Server] Captain Q router loaded from:', p);
      loaded = true;
      break;
    } catch { /* try next path */ }
  }
  if (!loaded) console.warn('[Server] Captain Q not found at any path');
} catch (e: any) {
  console.warn('[Server] Captain Q failed to load:', e.message);
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

// Clerk cookie names to clear when a stale/mismatched JWT is detected
const CLERK_COOKIE_NAMES = [
  "__session",
  "__clerk_db_jwt",
  "__client_uat",
  "__clerk_handshake",
];

function clearClerkCookies(res: any) {
  for (const name of CLERK_COOKIE_NAMES) {
    res.clearCookie(name, { path: "/" });
    res.clearCookie(name, { path: "/", domain: ".quoratorium.com" });
  }
}

/**
 * Clerk middleware scoped to /api/* only.
 * Wraps clerkMiddleware in an error-catching layer so that stale JWTs from
 * a previous Clerk instance (kid mismatch) are treated as unauthenticated
 * rather than crashing the request. Static file serving is NOT affected.
 */
function makeClerkApiMiddleware() {
  const clerk = clerkMiddleware({
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY || process.env.VITE_CLERK_PUBLISHABLE_KEY || "",
    secretKey: process.env.CLERK_SECRET_KEY || "",
  });

  return (req: any, res: any, next: any) => {
    clerk(req, res, (err?: any) => {
      if (err) {
        const msg = err?.message || String(err);
        const isStaleToken =
          msg.includes("Handshake token verification failed") ||
          msg.includes("Unable to find a signing key") ||
          msg.includes("JWKS");
        if (isStaleToken) {
          console.warn("[Clerk] Stale/mismatched JWT — clearing cookies, treating as unauthenticated.", msg);
          clearClerkCookies(res);
          req.auth = { userId: null, sessionId: null, sessionClaims: null };
          return next();
        }
        // For any other Clerk error, log it but still continue so the app
        // doesn't return an empty response to the client.
        console.error("[Clerk] Middleware error:", msg);
        req.auth = { userId: null, sessionId: null, sessionClaims: null };
        return next();
      }
      next();
    });
  };
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // /__clerk proxy — forwards to Clerk's frontend API so the browser can load
  // Clerk's JS bundle from the same origin without needing a clerk.quoratorium.com subdomain.
  // This avoids ERR_NAME_NOT_RESOLVED when the CNAME hasn't propagated yet.
  app.use(
    "/__clerk",
    createProxyMiddleware({
      target: "https://frontend-api.clerk.services",
      changeOrigin: true,
      pathRewrite: { "^/__clerk": "" },
      on: {
        error: (err: any, _req: any, res: any) => {
          console.error("[Clerk Proxy] Error:", err.message);
          if (!res.headersSent) {
            (res as any).status(502).send("Clerk proxy error");
          }
        },
      },
    })
  );

  // Stripe webhook needs raw body for signature verification — must be BEFORE json parser
  app.use("/api/webhooks/stripe",
    express.raw({ type: "application/json" }),
    (req: any, _res: any, next: any) => {
      req.rawBody = req.body;
      req.body = JSON.parse(req.body.toString());
      next();
    },
    stripeWebhookRouter
  );

  // Captain Q endpoints (TTS, image gen, social queue) — must be before Clerk middleware
  // so /api/test and /api/tts are not blocked by auth
  if (cqRouter) app.use(cqRouter);

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Clerk middleware — scoped to /api/* only so it never intercepts HTML page loads.
  // Static files and the SPA index.html are served without Clerk involvement.
  app.use("/api", makeClerkApiMiddleware());

  // Tag Sentry events with user ID from Clerk session when available
  app.use("/api", async (req, _res, next) => {
    try {
      const clerkAuth = (req as any).auth;
      if (clerkAuth?.userId) {
        Sentry.setUser({ id: clerkAuth.userId });
      }
    } catch {
      // Auth is optional — proceed without user tagging
    }
    next();
  });

  registerStorageProxy(app);
  registerStreamingRoutes(app);
  registerSandboxRoutes(app);

  // Clerk webhook endpoint
  app.use("/api/webhooks/clerk", clerkWebhookRouter);



  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // Sentry error handler — must be after all routes
  Sentry.setupExpressErrorHandler(app);

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

// Capture unhandled exceptions and rejections
process.on("uncaughtException", (error) => {
  Sentry.captureException(error);
  console.error("[Uncaught Exception]", error);
});

process.on("unhandledRejection", (reason) => {
  Sentry.captureException(reason);
  console.error("[Unhandled Rejection]", reason);
});

startServer().catch((err) => {
  Sentry.captureException(err);
  console.error(err);
});
