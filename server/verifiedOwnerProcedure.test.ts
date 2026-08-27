import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { router, verifiedOwnerProcedure } from "./_core/trpc";
import type { TrpcContext } from "./_core/context";
import type { User } from "./db";

const testRouter = router({
  sensitiveAction: verifiedOwnerProcedure.mutation(({ ctx }) => ({
    userId: ctx.user.id,
    verified: ctx.isVerifiedOwner,
  })),
});

const owner: User = {
  id: 1,
  clerk_id: "user_owner",
  name: "Anthony",
  email: "wisheswithoutbordersco@gmail.com",
  login_method: "clerk",
  role: "admin",
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
  last_signed_in: new Date(0).toISOString(),
};

const otherUser: User = {
  ...owner,
  id: 2,
  clerk_id: "user_other",
  email: "someone@example.com",
  role: "user",
};

function context(overrides: Partial<TrpcContext>): TrpcContext {
  return {
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    user: null,
    isOwner: false,
    authenticatedUser: null,
    isVerifiedOwner: false,
    ...overrides,
  };
}

async function expectCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    throw new Error("Expected procedure to reject");
  } catch (error) {
    expect(error).toBeInstanceOf(TRPCError);
    expect((error as TRPCError).code).toBe(code);
  }
}

describe("verifiedOwnerProcedure", () => {
  it("rejects the legacy ordinary-workspace owner fallback", async () => {
    const caller = testRouter.createCaller(
      context({ user: owner, isOwner: true }),
    );

    await expectCode(caller.sensitiveAction(), "UNAUTHORIZED");
  });

  it("rejects a real authenticated non-owner", async () => {
    const caller = testRouter.createCaller(
      context({
        user: otherUser,
        authenticatedUser: otherUser,
        isVerifiedOwner: false,
      }),
    );

    await expectCode(caller.sensitiveAction(), "FORBIDDEN");
  });

  it("allows a real authenticated owner and narrows the context user", async () => {
    const caller = testRouter.createCaller(
      context({
        user: owner,
        isOwner: true,
        authenticatedUser: owner,
        isVerifiedOwner: true,
      }),
    );

    await expect(caller.sensitiveAction()).resolves.toEqual({
      userId: owner.id,
      verified: true,
    });
  });
});
