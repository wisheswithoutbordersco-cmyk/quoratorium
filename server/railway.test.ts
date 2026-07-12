import { describe, it, expect } from "vitest";

describe("Railway credentials validation", () => {
  it("RAILWAY_TOKEN is set and has valid format", () => {
    const token = process.env.RAILWAY_TOKEN;
    expect(token).toBeDefined();
    expect(token!.length).toBeGreaterThan(20);
  });

  it("RAILWAY_TOKEN can authenticate with Railway API", async () => {
    const token = process.env.RAILWAY_TOKEN;
    const res = await fetch("https://backboard.railway.app/graphql/v2", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "{ me { name email } }" }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.errors).toBeUndefined();
    expect(data.data?.me).toHaveProperty("name");
  });
});
