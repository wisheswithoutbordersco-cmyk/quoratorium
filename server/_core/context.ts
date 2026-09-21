import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../db";
import { clerkClient, getAuth } from "@clerk/express";
import * as db from "../db";
import { ENV, OWNER_EMAILS } from "./env";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  /** A database user resolved from a verified Clerk session; never an anonymous fallback. */
  user: User | null;
  /** True only when the verified Clerk identity is the configured owner. */
  isOwner: boolean;
  /** Retained for compatibility; always mirrors `user` for production contexts. */
  authenticatedUser?: User | null;
  /** Retained for compatibility; only derived from a verified Clerk identity. */
  isVerifiedOwner?: boolean;
};

/**
 * Legacy compatibility export for routes that have not yet been migrated to
 * Clerk-aware request handling. It intentionally never resolves an owner:
 * callers must authenticate the request and use resolveAuthenticatedUser
 * instead. Keeping this fail-closed prevents anonymous owner impersonation.
 */
export async function getOwnerUser(): Promise<User | null> {
  return null;
}

function isOwnerIdentity(user: User | null): boolean {
  if (!user) return false;
  const isOwnerByOpenId = Boolean(
    ENV.ownerOpenId && user.clerk_id === ENV.ownerOpenId
  );
  const isOwnerByEmail = Boolean(
    user.email && OWNER_EMAILS.includes(user.email.toLowerCase())
  );
  return isOwnerByOpenId || isOwnerByEmail;
}

/**
 * Resolve the real Clerk-authenticated database user for a request.
 * There is intentionally no owner fallback: protected data and external actions
 * must always be tied to a verified session.
 */
export async function resolveAuthenticatedUser(
  req: CreateExpressContextOptions["req"]
): Promise<User | null> {
  let clerkUserId: string | null = null;
  try {
    const auth = getAuth(req);
    // Browser workspace access must come from a verified Clerk session token.
    if (!auth.userId || !auth.sessionId) return null;
    clerkUserId = auth.userId;
  } catch {
    // clerkMiddleware is intentionally absent when Clerk is not configured.
    return null;
  }

  try {
    let dbUser = await db.getUserByClerkId(clerkUserId);
    if (!dbUser || !dbUser.email) {
      const clerkUser = await clerkClient.users.getUser(clerkUserId);
      const email = clerkUser.emailAddresses?.[0]?.emailAddress || null;
      const name =
        [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
        clerkUser.username ||
        email ||
        "User";

      await db.upsertUser({
        clerkId: clerkUserId,
        name,
        email,
        loginMethod: "clerk",
        lastSignedIn: new Date(),
        role:
          email && OWNER_EMAILS.includes(email.toLowerCase())
            ? "admin"
            : undefined,
      });
      dbUser = await db.getUserByClerkId(clerkUserId);
    } else {
      await db.upsertUser({
        clerkId: clerkUserId,
        lastSignedIn: new Date(),
      });
    }
    return dbUser ?? null;
  } catch (error) {
    console.error("[Auth] Failed to resolve Clerk user:", error);
    return null;
  }
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  const authenticatedUser = await resolveAuthenticatedUser(opts.req);
  const isVerifiedOwner = isOwnerIdentity(authenticatedUser);

  return {
    req: opts.req,
    res: opts.res,
    user: authenticatedUser,
    isOwner: isVerifiedOwner,
    authenticatedUser,
    isVerifiedOwner,
  };
}
