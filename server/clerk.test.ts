import { describe, it, expect } from "vitest";

describe("Clerk credentials validation", () => {
  it("CLERK_PUBLISHABLE_KEY is set and has valid format (backend-accessible)", () => {
    const key = process.env.CLERK_PUBLISHABLE_KEY;
    expect(key).toBeDefined();
    expect(key!.startsWith("pk_")).toBe(true);
  });

  it("VITE_CLERK_PUBLISHABLE_KEY is set and has valid format (frontend-accessible)", () => {
    const key = process.env.VITE_CLERK_PUBLISHABLE_KEY;
    expect(key).toBeDefined();
    expect(key!.startsWith("pk_")).toBe(true);
  });

  it("CLERK_SECRET_KEY is set and has valid format", () => {
    const key = process.env.CLERK_SECRET_KEY;
    expect(key).toBeDefined();
    expect(key!.startsWith("sk_")).toBe(true);
  });

  it("CLERK_SECRET_KEY can authenticate with Clerk API", async () => {
    const key = process.env.CLERK_SECRET_KEY;
    const res = await fetch("https://api.clerk.com/v1/users?limit=1", {
      headers: { Authorization: `Bearer ${key}` },
    });
    // 200 means valid key (even if no users exist yet)
    expect(res.status).toBe(200);
  });
});
