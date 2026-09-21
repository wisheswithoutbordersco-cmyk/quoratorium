import { createServer } from "node:http";
import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../supabase", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }),
  }),
}));

import { addFileToSandbox, deploySandbox } from "./projectStore";
import { registerSandboxRoutes } from "./routes";

const ownerId = "1001";
let baseUrl = "";
let sandboxId = "";
let server: ReturnType<typeof createServer>;

beforeAll(async () => {
  ({ sandboxId } = await addFileToSandbox(
    ownerId,
    null,
    "index.html",
    "<script>document.body.textContent='safe preview'</script>",
    "html",
  ));
  await deploySandbox(ownerId, sandboxId);

  const app = express();
  app.use((req, _res, next) => {
    const suppliedId = req.header("x-test-workspace-user");
    if (suppliedId) (req as any).workspaceUser = { id: Number(suppliedId) };
    next();
  });
  registerSandboxRoutes(app);
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
});

describe("deployed sandbox HTTP boundary", () => {
  it("serves a deployed sandbox only to its owner with a restrictive CSP", async () => {
    const response = await fetch(`${baseUrl}/sandbox/${sandboxId}/`, {
      headers: { "x-test-workspace-user": ownerId },
    });
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('sandbox="allow-scripts"');
    expect(body).toContain("&lt;script&gt;document.body.textContent=&#39;safe preview&#39;&lt;/script&gt;");
    expect(body).not.toContain("<script>document.body.textContent='safe preview'</script>");
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    const csp = response.headers.get("content-security-policy") || "";
    expect(csp).toContain("connect-src 'none'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toContain("https:");
  });

  it("returns not found to anonymous and cross-user callers", async () => {
    const anonymous = await fetch(`${baseUrl}/sandbox/${sandboxId}/`);
    expect(anonymous.status).toBe(404);

    const crossUser = await fetch(`${baseUrl}/sandbox/${sandboxId}/`, {
      headers: { "x-test-workspace-user": "1002" },
    });
    expect(crossUser.status).toBe(404);
  });
});
