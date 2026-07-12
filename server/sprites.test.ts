import { describe, it, expect } from "vitest";

describe("Sprites.dev API Token Validation", () => {
  it("should have SPRITES_TOKEN environment variable set", () => {
    const token = process.env.SPRITES_TOKEN;
    expect(token).toBeDefined();
    expect(token!.length).toBeGreaterThan(10);
    expect(token!.startsWith("FlyV1")).toBe(true);
  });
});
