import { createServer } from "node:http";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pwaIconRouter } from "./pwaIconRoute";

let server: ReturnType<typeof createServer>;
let baseUrl = "";

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(pwaIconRouter);
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("PWA route test server did not bind");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
});

describe("PWA icon write boundary", () => {
  it("rejects an anonymous icon update before touching persistence", async () => {
    const response = await fetch(`${baseUrl}/api/settings/pwa-icon`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ icon: "data:image/png;base64,aGVsbG8=" }),
    });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: "A verified workspace session is required.",
    });
  });
});
