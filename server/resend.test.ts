import { describe, it, expect } from "vitest";

describe("Resend credentials validation", () => {
  it("RESEND_API_KEY can authenticate with Resend API", async () => {
    const apiKey = process.env.RESEND_API_KEY;
    expect(apiKey).toBeTruthy();

    // This key is restricted to send-only, so we test by sending to a known
    // invalid address which returns 422 (valid auth) vs 401 (invalid key)
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "onboarding@resend.dev",
        to: "test@invalid-test-domain-xyz.com",
        subject: "API Key Validation Test",
        text: "This is a test.",
      }),
    });

    // 200 = sent successfully, 422 = validation error (but auth passed)
    // 401 = invalid key
    expect(response.status).not.toBe(401);
    expect(response.status).toBeLessThan(500);
  });
});
