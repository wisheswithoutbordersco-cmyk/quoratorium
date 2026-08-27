import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";
import type { User } from "../db";

vi.mock("../db", () => ({
  getUserVault: vi.fn(),
  createVaultEntry: vi.fn(),
  deleteVaultEntry: vi.fn(),
}));

vi.mock("../storage", () => ({
  storagePut: vi.fn(),
}));

import { getUserVault } from "../db";
import { vaultRouter } from "./vault";

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

function caller() {
  const ctx: TrpcContext = {
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    user: owner,
    isOwner: true,
    authenticatedUser: owner,
    isVerifiedOwner: true,
  };
  return vaultRouter.createCaller(ctx);
}

beforeEach(() => vi.clearAllMocks());

describe("Vault internal record protection", () => {
  it("returns user-facing entries and strips every internal business record", async () => {
    vi.mocked(getUserVault).mockResolvedValue([
      { id: 1, user_id: 1, name: "Product photo", entry_type: "file" },
      { id: 2, user_id: 1, name: "Private note", entry_type: "note" },
      { id: 3, user_id: 1, name: "Encrypted Shopify", entry_type: "credential", metadata: { recordKind: "business_connection", ciphertext: "secret" } },
      { id: 4, user_id: 1, name: "Draft action", entry_type: "config", metadata: { recordKind: "business_action" } },
      { id: 5, user_id: 1, name: "Chat upload", entry_type: "file", metadata: { recordKind: "conversation_asset" }, file_key: "internal/key" },
      { id: 6, user_id: 1, name: "Legacy encrypted Shopify", entry_type: "business_connection", metadata: { ciphertext: "secret" } },
    ] as any);

    await expect(caller().list()).resolves.toEqual([
      expect.objectContaining({ id: 1, entry_type: "file" }),
      expect.objectContaining({ id: 2, entry_type: "note" }),
    ]);
  });
});
