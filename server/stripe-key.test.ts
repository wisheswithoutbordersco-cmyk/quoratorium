import { describe, it, expect } from "vitest";

describe("Stripe credentials validation", () => {
  it("STRIPE_SK can authenticate with Stripe API", async () => {
    const key = process.env.STRIPE_SK;
    expect(key, "STRIPE_SK must be set").toBeTruthy();
    expect(key).toMatch(/^sk_live_|^sk_test_/);

    const res = await fetch("https://api.stripe.com/v1/products?limit=1", {
      headers: { Authorization: `Bearer ${key}` },
    });
    expect(res.status, `Stripe API returned ${res.status}`).toBe(200);
  });
});
