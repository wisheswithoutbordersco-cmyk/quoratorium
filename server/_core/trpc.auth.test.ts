import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { createContext, type TrpcContext } from "./context";
import { protectedProcedure, router } from "./trpc";
import { appRouter } from "../routers";

const testRouter = router({
  protectedValue: protectedProcedure.query(({ ctx }) => ({
    userId: ctx.user.id,
  })),
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

describe("tRPC workspace authentication boundary", () => {
  it("does not substitute an owner when a request lacks a verified session", async () => {
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

    await expect(caller.protectedValue()).rejects.toMatchObject<
      Partial<TRPCError>
    >({
      code: "UNAUTHORIZED",
    });
  });

  it("issues a tool launch only for a verified owner session", async () => {
    process.env.QUORATORIUM_TEMPLATORIUM_SSO_SECRET = "t".repeat(40);
    const anonymous = appRouter.createCaller(unauthenticatedContext());
    await expect(
      anonymous.auth.toolLaunch({ tool: "templatorium" })
    ).rejects.toMatchObject<Partial<TRPCError>>({ code: "UNAUTHORIZED" });

    const owner = appRouter.createCaller({
      ...unauthenticatedContext(),
      user: { id: 42 } as TrpcContext["user"],
      isOwner: true,
      authenticatedUser: { id: 42 } as TrpcContext["authenticatedUser"],
      isVerifiedOwner: true,
    });
    await expect(
      owner.auth.toolLaunch({ tool: "templatorium" })
    ).resolves.toMatchObject({
      url: expect.stringContaining(
        "https://templatorium-production.up.railway.app/launch#ticket="
      ),
    });
    delete process.env.QUORATORIUM_TEMPLATORIUM_SSO_SECRET;
  });
});
