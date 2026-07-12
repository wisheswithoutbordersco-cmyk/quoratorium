import { describe, it, expect } from "vitest";
import { Webhook } from "svix";

describe("Clerk webhook secret validation", () => {
  it("CLERK_WEBHOOK_SECRET is configured and starts with whsec_", () => {
    const secret = process.env.CLERK_WEBHOOK_SECRET;
    expect(secret).toBeTruthy();
    expect(secret).toMatch(/^whsec_/);
  });

  it("svix Webhook can be instantiated with the secret", () => {
    const secret = process.env.CLERK_WEBHOOK_SECRET!;
    // This will throw if the secret format is invalid
    expect(() => new Webhook(secret)).not.toThrow();
  });

  it("svix correctly rejects a tampered payload", () => {
    const secret = process.env.CLERK_WEBHOOK_SECRET!;
    const wh = new Webhook(secret);

    // A real-looking but forged set of headers
    const forgedHeaders = {
      "svix-id": "msg_fake123",
      "svix-timestamp": String(Math.floor(Date.now() / 1000)),
      "svix-signature": "v1,fakesignaturevalue==",
    };

    expect(() =>
      wh.verify(JSON.stringify({ type: "user.created", data: {} }), forgedHeaders)
    ).toThrow();
  });
});
