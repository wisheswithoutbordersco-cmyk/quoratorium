import { describe, expect, it, vi } from "vitest";

vi.mock("../supabase", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }),
  }),
}));

import {
  addFileToSandbox,
  deploySandbox,
  getSandboxFiles,
  isSandboxOwnedBy,
  serveSandboxFile,
} from "./projectStore";

describe("sandbox authorization", () => {
  it("requires ownership for explicit deployment and serves only after deployment", async () => {
    const ownerId = `owner-${Date.now()}`;
    const otherUserId = `${ownerId}-other`;
    const { sandboxId } = await addFileToSandbox(
      ownerId,
      null,
      "index.html",
      "<h1>Private until deployed</h1>",
      "html",
    );

    expect(isSandboxOwnedBy(sandboxId, ownerId)).toBe(true);
    expect(isSandboxOwnedBy(sandboxId, otherUserId)).toBe(false);
    expect(getSandboxFiles(sandboxId)).toHaveLength(1);
    expect(serveSandboxFile(sandboxId, "index.html")).toBeNull();

    await expect(deploySandbox(otherUserId, sandboxId)).resolves.toMatchObject({
      success: false,
      error: "Sandbox not found for this user.",
    });
    expect(serveSandboxFile(sandboxId, "index.html")).toBeNull();

    await expect(deploySandbox(ownerId, sandboxId)).resolves.toMatchObject({
      success: true,
      sandboxId,
    });
    expect(serveSandboxFile(sandboxId, "index.html")?.content).toContain("Private until deployed");
  });
});
