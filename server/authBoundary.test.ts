import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./_core/context";
import type { User } from "./db";
import { router } from "./_core/trpc";
import { gitRouter } from "./routers/git";
import { deployRouter } from "./routers/deploy";

const owner: User = {
  id: 1,
  clerk_id: "owner_workspace",
  name: "Owner",
  email: "wisheswithoutbordersco@gmail.com",
  login_method: "owner_bypass",
  role: "admin",
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
  last_signed_in: new Date(0).toISOString(),
};

const regularUser: User = {
  ...owner,
  id: 2,
  clerk_id: "regular_user",
  email: "user@example.com",
  role: "user",
};

const protectedRouter = router({
  git: gitRouter,
  deploy: deployRouter,
});

function unauthenticatedOwnerFallbackContext(): TrpcContext {
  return {
    req: { headers: {}, socket: { remoteAddress: "127.0.0.1" } } as any,
    res: {} as TrpcContext["res"],
    user: owner,
    isOwner: true,
    authenticatedUser: null,
    isVerifiedOwner: false,
  };
}

async function expectUnauthorized(promise: Promise<unknown>) {
  try {
    await promise;
    throw new Error("Expected procedure to reject");
  } catch (error) {
    expect(error).toBeInstanceOf(TRPCError);
    expect((error as TRPCError).code).toBe("UNAUTHORIZED");
  }
}

async function expectForbidden(promise: Promise<unknown>) {
  try {
    await promise;
    throw new Error("Expected procedure to reject");
  } catch (error) {
    expect(error).toBeInstanceOf(TRPCError);
    expect((error as TRPCError).code).toBe("FORBIDDEN");
  }
}

describe("protected service boundary", () => {
  it("does not accept an implicit owner identity for GitHub status", async () => {
    const caller = protectedRouter.createCaller(unauthenticatedOwnerFallbackContext());
    await expectUnauthorized(caller.git.status());
  });

  it("does not accept an implicit owner identity for deployment status", async () => {
    const caller = protectedRouter.createCaller(unauthenticatedOwnerFallbackContext());
    await expectUnauthorized(caller.deploy.status());
  });

  it("does not let a regular authenticated user consume shared Cloudflare credentials", async () => {
    const caller = protectedRouter.createCaller({
      ...unauthenticatedOwnerFallbackContext(),
      user: regularUser,
      authenticatedUser: regularUser,
      isOwner: false,
      isVerifiedOwner: false,
    });
    await expectForbidden(caller.deploy.deploy({ projectId: 1 }));
  });
});
