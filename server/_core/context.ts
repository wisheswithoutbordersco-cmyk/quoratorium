import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../db";
import { clerkClient } from "@clerk/express";
import * as db from "../db";
import { ENV, OWNER_EMAILS } from "./env";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  /** True when the current Clerk-authenticated identity belongs to the owner. */
  isOwner: boolean;
  /** The database user resolved from the verified Clerk session. */
  authenticatedUser?: User | null;
  /** True only when Clerk verified the current request and that identity belongs to the owner. */
  isVerifiedOwner?: boolean;
};

function isOwnerIdentity(user: User | null): boolean {
  if (!user) return false;
  const isOwnerByOpenId = Boolean(ENV.ownerOpenId && user.clerk_id === ENV.ownerOpenId);
  const isOwnerByEmail = Boolean(
    user.email && OWNER_EMAILS.includes(user.email.toLowerCase()),
  );
  return isOwnerByOpenId || isOwnerByEmail;
}

/**
 * Resolve the real Clerk-authenticated database user for a request.
 * There is intentionally no owner fallback: protected data and external actions
 * must always be tied to a verified session.
 */
export async function resolveAuthenticatedUser(
  req: CreateExpressContextOptions["req"],
): Promise<User | null> {
  const clerkAuth = (req as any).auth;
  const clerkUserId = clerkAuth?.userId;
  if (!clerkUserId) return null;

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
        role: email && OWNER_EMAILS.includes(email.toLowerCase()) ? "admin" : undefined,
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
  opts: CreateExpressContextOptions,
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
