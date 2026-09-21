import { createServer } from "node:http";
import express from "express";
import { Webhook } from "svix";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { rawJsonBody, parsePreservedJson } from "./rawJsonWebhook";
import { clerkWebhookRouter } from "./webhooks/clerk";

const secret = "whsec_dGVzdC13ZWJob29rLXNlY3JldC13aXRoLWVudHJvcHk=";
const originalSecret = process.env.CLERK_WEBHOOK_SECRET;
let server: ReturnType<typeof createServer>;
let baseUrl = "";

beforeAll(async () => {
  process.env.CLERK_WEBHOOK_SECRET = secret;
  const app = express();
  app.use("/api/webhooks/clerk", rawJsonBody, parsePreservedJson, clerkWebhookRouter);
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Webhook test server did not bind");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(() => {
  process.env.CLERK_WEBHOOK_SECRET = secret;
});

afterAll(async () => {
  if (originalSecret === undefined) delete process.env.CLERK_WEBHOOK_SECRET;
  else process.env.CLERK_WEBHOOK_SECRET = originalSecret;
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
});

function signedHeaders(payload: string) {
  const id = `msg_${Date.now()}`;
  const timestamp = new Date();
  const signature = new Webhook(secret).sign(id, timestamp, payload);
  return {
    "content-type": "application/json",
    "svix-id": id,
    "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
    "svix-signature": signature,
  };
}

describe("Clerk raw webhook boundary", () => {
  it("accepts a correctly signed raw payload without reserializing it", async () => {
    const payload = '{\n  "type": "session.created",\n  "data": {"id": "sess_1"}\n}';
    const response = await fetch(`${baseUrl}/api/webhooks/clerk`, {
      method: "POST",
      headers: signedHeaders(payload),
      body: payload,
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
  });

  it("rejects changed bytes even when the JSON value is equivalent", async () => {
    const signedPayload = '{"type":"session.created","data":{"id":"sess_1"}}';
    const changedPayload = '{ "type": "session.created", "data": {"id":"sess_1"} }';
    const response = await fetch(`${baseUrl}/api/webhooks/clerk`, {
      method: "POST",
      headers: signedHeaders(signedPayload),
      body: changedPayload,
    });
    expect(response.status).toBe(401);
  });

  it("rejects invalid JSON before reaching the webhook handler", async () => {
    const payload = "{not-json";
    const response = await fetch(`${baseUrl}/api/webhooks/clerk`, {
      method: "POST",
      headers: signedHeaders(payload),
      body: payload,
    });
    expect(response.status).toBe(400);
  });
});
