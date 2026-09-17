import { describe, expect, it } from "vitest";
import { getMostRecentConversation } from "../client/src/lib/conversations";

describe("getMostRecentConversation", () => {
  it("returns the conversation with the newest updated timestamp regardless of list order", () => {
    const conversations = [
      { id: 1, updatedAt: "2026-01-02T12:00:00.000Z" },
      { id: 3, updatedAt: "2026-01-05T12:00:00.000Z" },
      { id: 2, updatedAt: "2026-01-03T12:00:00.000Z" },
    ];

    expect(getMostRecentConversation(conversations)?.id).toBe(3);
  });

  it("falls back to createdAt and handles an empty list", () => {
    expect(getMostRecentConversation([
      { id: "older", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "newer", createdAt: "2026-01-02T00:00:00.000Z" },
    ])?.id).toBe("newer");
    expect(getMostRecentConversation([])).toBeUndefined();
  });
});
