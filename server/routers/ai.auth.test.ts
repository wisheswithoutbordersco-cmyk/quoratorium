import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

vi.mock("../db", () => ({
  getConversationHistory: vi.fn().mockResolvedValue([]),
  addOrchestrationEvent: vi.fn().mockResolvedValue(1),
  addConversationMessage: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  getProject: vi.fn(),
  createGeneratedFile: vi.fn(),
}));

vi.mock("../workers", () => ({
  callBuilder: vi.fn(),
  callValidator: vi.fn(),
  callResearch: vi.fn(),
  callCaptainPlan: vi.fn(),
}));

vi.mock("../supabaseMemoryService", () => ({
  getGlobalMemoryContext: vi.fn().mockResolvedValue(""),
}));

vi.mock("../tools/index", () => ({
  runToolLoop: vi.fn().mockResolvedValue({
    response: "Done",
    toolsUsed: [],
    artifacts: [],
  }),
}));

import { runToolLoop } from "../tools/index";
import { aiRouter } from "./ai";

type User = NonNullable<TrpcContext["user"]>;

function user(id: number, loginMethod = "clerk"): User {
  return {
    id,
    clerk_id: `user-${id}`,
    email: `user${id}@example.com`,
    name: `User ${id}`,
    login_method: loginMethod,
    role: "user",
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    last_signed_in: new Date(0).toISOString(),
  };
}

function context(
  workspaceUser: User,
  authenticatedUser: User | null
): TrpcContext {
  return {
    user: workspaceUser,
    authenticatedUser,
    isOwner: workspaceUser.role === "admin",
    isVerifiedOwner: Boolean(authenticatedUser?.role === "admin"),
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(runToolLoop).mockResolvedValue({
    response: "Done",
    toolsUsed: [],
    artifacts: [],
  });
});

describe("ai.chat external-tool identity", () => {
  it("passes the verified Clerk-backed user to GitHub tools", async () => {
    const verifiedUser = user(7);
    const caller = aiRouter.createCaller(context(verifiedUser, verifiedUser));

    await caller.chat({ message: "Inspect my GitHub repositories" });

    expect(runToolLoop).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        userId: "7",
        authenticatedUserId: "7",
      }),
      expect.any(String)
    );
  });

  it("does not promote an owner-workspace fallback into GitHub identity", async () => {
    const fallbackOwner = { ...user(1, "owner_bypass"), role: "admin" } as User;
    const caller = aiRouter.createCaller(context(fallbackOwner, null));

    await expect(
      caller.chat({ message: "Inspect my GitHub repositories" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(runToolLoop).not.toHaveBeenCalled();
  });
});
