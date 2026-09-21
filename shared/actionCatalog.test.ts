import { describe, expect, it } from "vitest";
import {
  assertActionEnabled,
  getActionCatalogEntry,
  getGitHubActionCatalog,
  GITHUB_ACTION_IDS,
} from "./actionCatalog";

describe("GitHub Action Catalog", () => {
  it("enables audited reads without confirmation", () => {
    const read = getActionCatalogEntry(GITHUB_ACTION_IDS.readFile);
    expect(read).toEqual(
      expect.objectContaining({
        permissions: ["contents:read"],
        mode: "read",
        riskLevel: "none",
        confirmationRule: "none",
        enabled: true,
        audit: true,
      })
    );
    expect(assertActionEnabled(GITHUB_ACTION_IDS.readFile)).toBe(read);
  });

  it("keeps all writes disabled during phase one", () => {
    const writes = getGitHubActionCatalog().filter(
      action =>
        action.mode === "write" ||
        action.mode === "propose" ||
        action.mode === "prohibited"
    );
    expect(writes.length).toBeGreaterThan(0);
    expect(writes.every(action => action.enabled === false)).toBe(true);
  });

  it("permanently marks merge as prohibited with no confirmation path", () => {
    const merge = getActionCatalogEntry(GITHUB_ACTION_IDS.mergePullRequest);
    expect(merge.mode).toBe("prohibited");
    expect(merge.riskLevel).toBe("critical");
    expect(merge.confirmationRule).toBe("never");
    expect(() =>
      assertActionEnabled(GITHUB_ACTION_IDS.mergePullRequest)
    ).toThrow("no merge capability");
  });
});
