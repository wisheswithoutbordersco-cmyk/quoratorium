import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { businessActionProcedure, router } from "./_core/trpc";
import type { TrpcContext } from "./_core/context";
import type { User } from "./db";
import {
  resetBusinessActionAuthForTests,
  startBusinessActionSession,
} from "./businessActionAuth";

const testRouter = router({
  sensitiveAction: businessActionProcedure.mutation(({ ctx }) => ({
    userId: ctx.user.id,
    allowed: true,
  })),
});

const owner: User = {
  id: 1,
  clerk_id: "owner_workspace",
  name: "Anthony",
  email: "wisheswithoutbordersco@gmail.com",
  login_method: "workspace",
  role: "admin",
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
  last_signed_in: new Date(0).toISOString(),
};

function cookieFor(ownerId: number): string {
  const res = { cookie: vi.fn(), clearCookie: vi.fn() } as any;
  startBusinessActionSession(res, ownerId);
  const [name, value] = res.cookie.mock.calls[0];
  return `${name}=${encodeURIComponent(value)}`;
}

function context(options: {
  user?: User | null;
  isOwner?: boolean;
  cookie?: string;
} = {}): TrpcContext {
  return {
    req: {
      headers: { cookie: options.cookie || "" },
      socket: { remoteAddress: "127.0.0.1" },
      ip: "127.0.0.1",
    } as any,
    res: {} as TrpcContext["res"],
    user: options.user ?? null,
    isOwner: options.isOwner ?? false,
    authenticatedUser: null,
    isVerifiedOwner: false,
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

beforeEach(() => {
  resetBusinessActionAuthForTests();
  process.env.BUSINESS_ACTION_PIN = "correct-horse-47";
  process.env.BUSINESS_ACTION_SESSION_SECRET = "test-session-secret-with-entropy";
});

describe("businessActionProcedure", () => {
  it("rejects an owner workspace request without an action session", async () => {
    const caller = testRouter.createCaller(
      context({ user: owner, isOwner: true }),
    );
    await expectCode(caller.sensitiveAction(), "UNAUTHORIZED");
  });

  it("rejects a non-owner even when a syntactically valid session exists", async () => {
    const caller = testRouter.createCaller(
      context({ user: owner, isOwner: false, cookie: cookieFor(owner.id) }),
    );
    await expectCode(caller.sensitiveAction(), "FORBIDDEN");
  });

  it("allows only the owner with a valid short-lived action session", async () => {
    const caller = testRouter.createCaller(
      context({ user: owner, isOwner: true, cookie: cookieFor(owner.id) }),
    );
    await expect(caller.sensitiveAction()).resolves.toEqual({
      userId: owner.id,
      allowed: true,
    });
  });
});
