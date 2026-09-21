import { describe, expect, it } from "vitest";
import { calculateCost } from "./costService";

describe("cost runtime model pricing", () => {
  it("prices supported Manus proxy model IDs", () => {
    expect(calculateCost("gpt-5-mini", 1_000_000, 1_000_000)).toBe(2.25);
    expect(calculateCost("gemini-3.1-pro-preview", 1_000_000, 1_000_000)).toBe(14);
  });

  it("keeps output token cost bounded and deterministic", () => {
    expect(calculateCost("gpt-5", 2_000, 4_096)).toBeGreaterThan(0);
    expect(calculateCost("gpt-5", 2_000, 4_096)).toBeLessThan(1);
  });
});
