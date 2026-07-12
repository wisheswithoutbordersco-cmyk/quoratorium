import { describe, it, expect } from "vitest";

describe("Clerk production key validation", () => {
  it("CLERK_SECRET_KEY can authenticate with Clerk API", async () => {
    const key = process.env.CLERK_SECRET_KEY;
    expect(key, "CLERK_SECRET_KEY must be set").toBeTruthy();
    expect(key!.startsWith("sk_live_"), "Must be a production key (sk_live_)").toBe(true);

    const res = await fetch("https://api.clerk.com/v1/instance", {
      headers: { Authorization: `Bearer ${key}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { environment_type?: string };
    expect(data.environment_type).toBe("production");
  });
});
