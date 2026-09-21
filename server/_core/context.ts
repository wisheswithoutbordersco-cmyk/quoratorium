import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../db";
import { clerkClient, getAuth } from "@clerk/express";
import * as db from "../db";
import { ENV, OWNER_EMAILS } from "./env";
import { getOwnerAccessSession } from "../ownerAccessAuth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  /** A database user resolved from a verified Clerk or signed owner session. */
  user: User | null;
  /** True only when the verified identity is the configured owner. */
  isOwner: boolean;
  /** Retained for compatibility; mirrors the verified workspace user. */
  authenticatedUser?: User | null;
  /** Retained for compatibility; only derived from a verified identity. */
  isVerifiedOwner?: boolean;
};

let ownerUserCache: User | null | undefined;

export async function getOwnerUser(): Promise<User | null> {
  if (ownerUserCache !== undefined) return ownerUserCache;
  const ownerOpenId = process.env.OWNER_OPEN_ID || ENV.ownerOpenId;
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
        email: OWNER_EMAILS[0] || null,
        loginMethod: "owner_access",
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
  const isOwnerByOpenId = Boolean(
    ENV.ownerOpenId && user.clerk_id === ENV.ownerOpenId
  );
  const isOwnerByEmail = Boolean(
    user.email && OWNER_EMAILS.includes(user.email.toLowerCase())
  );
  return isOwnerByOpenId || isOwnerByEmail;
}

/**
 * Resolve a verified database user from Clerk or from the signed, expiring
 * owner-access cookie. No browser storage or implicit anonymous owner fallback
 * is accepted.
 */
export async function resolveAuthenticatedUser(
  req: CreateExpressContextOptions["req"]
): Promise<User | null> {
  let clerkUserId: string | null = null;
  try {
    const auth = getAuth(req);
    if (auth.userId && auth.sessionId) clerkUserId = auth.userId;
  } catch {
    // Clerk is optional; the signed owner session below remains available.
  }

  if (clerkUserId) {
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

  const ownerAccess = getOwnerAccessSession(req);
  if (!ownerAccess) return null;
  try {
    const owner = await db.getUserById(ownerAccess.ownerId);
    return owner && isOwnerIdentity(owner) ? owner : null;
  } catch (error) {
    console.error("[Auth] Failed to resolve signed owner session:", error);
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
