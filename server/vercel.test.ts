import { describe, it, expect } from "vitest";

describe("Vercel credentials validation", () => {
  it("VERCEL_TOKEN is set and has valid format", () => {
    const token = process.env.VERCEL_TOKEN;
    expect(token).toBeDefined();
    expect(token!.length).toBeGreaterThan(20);
  });

  it("VERCEL_TOKEN can authenticate with Vercel API", async () => {
    const token = process.env.VERCEL_TOKEN;
    const res = await fetch("https://api.vercel.com/v2/user", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.user).toHaveProperty("id");
  });
});
