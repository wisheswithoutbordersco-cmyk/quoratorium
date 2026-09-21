import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { createContext, type TrpcContext } from "./context";
import { protectedProcedure, router } from "./trpc";

const testRouter = router({
  protectedValue: protectedProcedure.query(({ ctx }) => ({ userId: ctx.user.id })),
});

function unauthenticatedContext(): TrpcContext {
  return {
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    user: null,
    isOwner: false,
    authenticatedUser: null,
    isVerifiedOwner: false,
  };
}

describe("tRPC Clerk authentication boundary", () => {
  it("does not substitute an owner when an Express request lacks verified Clerk auth", async () => {
    const context = await createContext({
      req: { headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    });

    expect(context.user).toBeNull();
    expect(context.authenticatedUser).toBeNull();
    expect(context.isOwner).toBe(false);
  });

  it("rejects anonymous callers before a protected procedure executes", async () => {
    const caller = testRouter.createCaller(unauthenticatedContext());

    await expect(caller.protectedValue()).rejects.toMatchObject<Partial<TRPCError>>({
      code: "UNAUTHORIZED",
    });
  });
});
