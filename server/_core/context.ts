import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../db";
import { clerkClient } from "@clerk/express";
import * as db from "../db";
import { ENV, OWNER_EMAILS } from "./env";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  /** True when this request is operating in Anthony's owner workspace. */
  isOwner: boolean;
  /** Optional database user resolved from Clerk when Clerk is available. */
  authenticatedUser?: User | null;
  /** Optional Clerk owner signal retained for non-business compatibility only. */
  isVerifiedOwner?: boolean;
};

let ownerUserCache: User | null | undefined;

export async function getOwnerUser(): Promise<User | null> {
  if (ownerUserCache !== undefined) return ownerUserCache;
  const ownerOpenId = ENV.ownerOpenId;
  if (!ownerOpenId) {
    ownerUserCache = null;
    return null;
  }

  try {
    let ownerUser = await db.getUserByClerkId(ownerOpenId);
    if (!ownerUser) {
      await db.upsertUser({
        clerkId: ownerOpenId,
        name: process.env.OWNER_NAME || "Owner",
        email: null,
        loginMethod: "owner_bypass",
        lastSignedIn: new Date(),
        role: "admin",
      });
      ownerUser = await db.getUserByClerkId(ownerOpenId);
    }
    ownerUserCache = ownerUser ?? null;
    return ownerUserCache;
  } catch (error) {
    console.error("[Auth] Failed to resolve owner workspace:", error);
    return null;
  }
}

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

  // Preserve Anthony's existing private-workspace behavior for ordinary Q chat.
  // External business mutations require a separate short-lived action session.
  let user = authenticatedUser;
  let isOwner = isVerifiedOwner;
  if (!user) {
    try {
      user = await getOwnerUser();
      isOwner = Boolean(user);
    } catch (error) {
      console.error("[Auth] Failed to resolve workspace owner:", error);
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    isOwner,
    authenticatedUser,
    isVerifiedOwner,
  };
}
