/**
 * Sandbox Routes
 * 
 * Serves deployed sandbox projects at /sandbox/:sandboxId/*
 * Each sandbox gets its own URL namespace where files are served directly.
 */
import type { Express, Request, Response } from "express";
import { serveSandboxFile, loadSandboxFromStore, getSandboxFiles, isSandboxOwnedBy } from "./projectStore";

function workspaceUserId(req: Request): string | null {
  const id = (req as any).workspaceUser?.id;
  return Number.isInteger(id) && id > 0 ? String(id) : null;
}

async function ensureOwnedSandbox(req: Request, res: Response): Promise<boolean> {
  const { sandboxId } = req.params;
  const userId = workspaceUserId(req);
  if (!userId) {
    res.status(404).send("Sandbox not found");
    return false;
  }
  await loadSandboxFromStore(sandboxId);
  if (!isSandboxOwnedBy(sandboxId, userId)) {
    res.status(404).send("Sandbox not found");
    return false;
  }
  return true;
}

function setSandboxHeaders(res: Response, contentType: string): void {
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'self' data: blob:; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; navigate-to 'none'",
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sendSandboxContent(res: Response, result: { content: string; contentType: string }): void {
  if (result.contentType.startsWith("text/html")) {
    setSandboxHeaders(res, "text/html; charset=utf-8");
    res.send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Toríu Project Preview</title>
    <style>html,body,iframe{width:100%;height:100%;margin:0;border:0}body{overflow:hidden;background:#fff}</style>
  </head>
  <body>
    <iframe sandbox="allow-scripts" referrerpolicy="no-referrer" srcdoc="${escapeHtml(result.content)}" title="Project preview"></iframe>
  </body>
</html>`);
    return;
  }

  setSandboxHeaders(res, result.contentType);
  res.send(result.content);
}

export function registerSandboxRoutes(app: Express): void {
  // Serve sandbox files
  app.get("/sandbox/:sandboxId/*", async (req: Request, res: Response) => {
    const { sandboxId } = req.params;
    const filePath = req.params[0] || "index.html";

    if (!(await ensureOwnedSandbox(req, res))) return;

    // The ownership check loads the sandbox into memory when needed.
    let result = serveSandboxFile(sandboxId, filePath);

    if (!result) {
      // Return a nice 404 page
      res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Sandbox Not Found</title>
          <style>
            body { font-family: system-ui; background: #0a0a0a; color: #e0e0e0; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
            .container { text-align: center; padding: 2rem; }
            h1 { font-size: 2rem; margin-bottom: 0.5rem; }
            p { color: #888; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Sandbox Not Found</h1>
            <p>This sandbox doesn't exist or hasn't been deployed yet.</p>
          </div>
        </body>
        </html>
      `);
      return;
    }

    sendSandboxContent(res, result);
  });

  // Serve sandbox root (without trailing path)
  app.get("/sandbox/:sandboxId", async (req: Request, res: Response) => {
    const { sandboxId } = req.params;

    if (!(await ensureOwnedSandbox(req, res))) return;

    // Try to serve index.html
    let result = serveSandboxFile(sandboxId, "index.html");

    if (!result) {
      // Show file listing if no index.html
      const files = getSandboxFiles(sandboxId);
      if (files.length > 0) {
        const fileList = files.map(f => {
          const href = `/sandbox/${encodeURIComponent(sandboxId)}/${f.filename.split("/").map(encodeURIComponent).join("/")}`;
          return `<li><a href="${href}">${escapeHtml(f.filename)}</a></li>`;
        }).join("");
        setSandboxHeaders(res, "text/html; charset=utf-8");
        res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Sandbox ${sandboxId}</title>
            <style>
              body { font-family: system-ui; background: #0a0a0a; color: #e0e0e0; padding: 2rem; }
              a { color: #60a5fa; }
              li { margin: 0.5rem 0; }
            </style>
          </head>
          <body>
            <h1>Sandbox: ${sandboxId}</h1>
            <ul>${fileList}</ul>
          </body>
          </html>
        `);
        return;
      }

      res.redirect(`/sandbox/${sandboxId}/`);
      return;
    }

    sendSandboxContent(res, result);
  });

  // API: Get sandbox file listing
  app.get("/api/sandbox/:sandboxId/files", async (req: Request, res: Response) => {
    const { sandboxId } = req.params;
    const workspaceUser = (req as any).workspaceUser;

    // Try loading from store if not in memory.
    await loadSandboxFromStore(sandboxId);
    if (!workspaceUser || !isSandboxOwnedBy(sandboxId, String(workspaceUser.id))) {
      res.status(404).json({ error: "Sandbox not found" });
      return;
    }
    const files = getSandboxFiles(sandboxId);

    res.json({
      sandboxId,
      files: files.map(f => ({
        filename: f.filename,
        language: f.language,
        size: f.content.length,
        updatedAt: f.updatedAt,
      })),
    });
  });
}
