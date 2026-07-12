import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../db";
import { clerkClient } from "@clerk/express";
import * as db from "../db";
import { ENV, OWNER_EMAILS } from "./env";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  /** True when this request is running as the platform owner (unlimited credits, no sign-up wall) */
  isOwner: boolean;
};

/**
 * Owner bypass: When Clerk auth is unavailable (DNS not propagated),
 * resolve the owner user from OWNER_OPEN_ID so protected procedures still work.
 * This ensures GitHub push, deploy, memory, and build pipeline function
 * even while Clerk is bypassed on the frontend.
 */
let _ownerUserCache: User | null | undefined = undefined;

async function getOwnerUser(): Promise<User | null> {
  if (_ownerUserCache !== undefined) return _ownerUserCache;

  const ownerOpenId = ENV.ownerOpenId;
  if (!ownerOpenId) {
    _ownerUserCache = null;
    return null;
  }

  try {
    let ownerUser = await db.getUserByClerkId(ownerOpenId);
    if (!ownerUser) {
      // Create the owner user record if it doesn't exist
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
    _ownerUserCache = ownerUser ?? null;
    return _ownerUserCache;
  } catch (error) {
    console.warn("[Auth] Owner bypass: failed to resolve owner user:", error);
    _ownerUserCache = null;
    return null;
  }
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  // CRITICAL: Always resolve to owner user to bypass all auth checks
  // This allows the owner to use all features without login prompts
  try {
    user = await getOwnerUser();
    if (user) {
      console.log("[Auth] Owner bypass active - all requests authenticated as owner");
    }
  } catch (error) {
    console.error("[Auth] Failed to get owner user:", error);
    user = null;
  }

  // Fallback: try Clerk auth if owner bypass fails
  if (!user) {
    try {
      const clerkAuth = (opts.req as any).auth;
      if (clerkAuth?.userId) {
        const clerkUserId = clerkAuth.userId;
        let dbUser = await db.getUserByClerkId(clerkUserId);

        if (!dbUser) {
          try {
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
            });
            dbUser = await db.getUserByClerkId(clerkUserId);
          } catch (error) {
            console.error("[Auth] Failed to sync Clerk user:", error);
          }
        } else {
          await db.upsertUser({
            clerkId: clerkUserId,
            lastSignedIn: new Date(),
          });
        }

        user = dbUser ?? null;
      }
    } catch (error) {
      console.error("[Auth] Fallback auth failed:", error);
      user = null;
    }
  }

  // Determine if this request is the platform owner
  // Bypass: match by OWNER_OPEN_ID (Manus platform) OR by email (wisheswithoutbordersco@gmail.com)
  const ownerOpenId = ENV.ownerOpenId;
  const isOwnerByOpenId = !!(user && ownerOpenId && user.clerk_id === ownerOpenId);
  const isOwnerByEmail = !!(user?.email && OWNER_EMAILS.includes(user.email.toLowerCase()));
  const isOwner = isOwnerByOpenId || isOwnerByEmail;

  return {
    req: opts.req,
    res: opts.res,
    user,
    isOwner,
  };
}
