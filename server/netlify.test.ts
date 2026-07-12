import { describe, it, expect } from "vitest";

describe("Netlify credentials validation", () => {
  it("NETLIFY_TOKEN is set and has valid format", () => {
    const token = process.env.NETLIFY_TOKEN;
    expect(token).toBeDefined();
    expect(token!.startsWith("nfp_")).toBe(true);
    expect(token!.length).toBeGreaterThan(20);
  });

  it("NETLIFY_TOKEN can authenticate with Netlify API", async () => {
    const token = process.env.NETLIFY_TOKEN;
    const res = await fetch("https://api.netlify.com/api/v1/user", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const user = await res.json();
    expect(user).toHaveProperty("id");
  });
});
