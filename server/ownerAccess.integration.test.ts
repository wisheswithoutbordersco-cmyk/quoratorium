import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "./db";

const fixtures = vi.hoisted(() => ({
  owner: {
    id: 7,
    clerk_id: "owner_workspace",
    name: "Owner",
    email: "wisheswithoutbordersco@gmail.com",
    login_method: "owner_access",
    role: "admin" as const,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    last_signed_in: new Date(0).toISOString(),
  },
}));

vi.mock("./db", async importOriginal => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getUserByClerkId: vi.fn(async () => fixtures.owner),
    getUserById: vi.fn(async () => fixtures.owner),
    upsertUser: vi.fn(async () => undefined),
  };
});

import { createContext, type TrpcContext } from "./_core/context";
import { resetOwnerAccessAuthForTests } from "./ownerAccessAuth";
import { appRouter } from "./routers";

function request(cookie = "") {
  return {
    headers: { cookie },
    socket: { remoteAddress: "127.0.0.1" },
    ip: "127.0.0.1",
    protocol: "https",
  } as TrpcContext["req"];
}

describe("owner access integration", () => {
  beforeEach(() => {
    resetOwnerAccessAuthForTests();
    process.env.NODE_ENV = "test";
    process.env.OWNER_OPEN_ID = fixtures.owner.clerk_id;
    process.env.OWNER_ACCESS_CODE = "owner-access-47";
    process.env.OWNER_ACCESS_SESSION_SECRET =
      "test-owner-session-secret-with-entropy";
  });

  it("unlocks through tRPC and creates a signed HTTP-only cookie", async () => {
    const response = { cookie: vi.fn(), clearCookie: vi.fn() } as any;
    const caller = appRouter.createCaller({
      req: request(),
      res: response,
      user: null,
      isOwner: false,
      authenticatedUser: null,
      isVerifiedOwner: false,
    });

    await expect(
      caller.auth.unlock({ code: "owner-access-47" })
    ).resolves.toMatchObject({ authenticated: true, isOwner: true });
    expect(response.cookie).toHaveBeenCalledWith(
      "q_owner_access",
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        sameSite: "strict",
        path: "/",
      })
    );
  });

  it("resolves the signed cookie to the configured owner", async () => {
    const response = { cookie: vi.fn(), clearCookie: vi.fn() } as any;
    const unlockCaller = appRouter.createCaller({
      req: request(),
      res: response,
      user: null,
      isOwner: false,
      authenticatedUser: null,
      isVerifiedOwner: false,
    });
    await unlockCaller.auth.unlock({ code: "owner-access-47" });

    const [name, token] = response.cookie.mock.calls[0];
    const context = await createContext({
      req: request(`${name}=${encodeURIComponent(token)}`),
      res: {} as TrpcContext["res"],
    });

    expect(context.user).toMatchObject<Partial<User>>({
      id: fixtures.owner.id,
      role: "admin",
    });
    expect(context.isOwner).toBe(true);
    expect(context.isVerifiedOwner).toBe(true);
  });
});
