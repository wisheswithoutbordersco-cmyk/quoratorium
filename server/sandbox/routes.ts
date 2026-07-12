/**
 * Sandbox Routes
 * 
 * Serves deployed sandbox projects at /sandbox/:sandboxId/*
 * Each sandbox gets its own URL namespace where files are served directly.
 */
import type { Express, Request, Response } from "express";
import { serveSandboxFile, loadSandboxFromStore, getSandboxFiles } from "./projectStore";

export function registerSandboxRoutes(app: Express): void {
  // Serve sandbox files
  app.get("/sandbox/:sandboxId/*", async (req: Request, res: Response) => {
    const { sandboxId } = req.params;
    const filePath = req.params[0] || "index.html";

    // Try to serve from memory first
    let result = serveSandboxFile(sandboxId, filePath);

    // If not in memory, try loading from Supabase
    if (!result) {
      const loaded = await loadSandboxFromStore(sandboxId);
      if (loaded) {
        result = serveSandboxFile(sandboxId, filePath);
      }
    }

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

    res.setHeader("Content-Type", result.contentType);
    // Security headers for sandboxed content
    res.setHeader("X-Frame-Options", "ALLOWALL");
    res.setHeader("Content-Security-Policy", "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;");
    res.send(result.content);
  });

  // Serve sandbox root (without trailing path)
  app.get("/sandbox/:sandboxId", async (req: Request, res: Response) => {
    const { sandboxId } = req.params;

    // Try to serve index.html
    let result = serveSandboxFile(sandboxId, "index.html");

    if (!result) {
      const loaded = await loadSandboxFromStore(sandboxId);
      if (loaded) {
        result = serveSandboxFile(sandboxId, "index.html");
      }
    }

    if (!result) {
      // Show file listing if no index.html
      const files = getSandboxFiles(sandboxId);
      if (files.length > 0) {
        const fileList = files.map(f => `<li><a href="/sandbox/${sandboxId}/${f.filename}">${f.filename}</a></li>`).join("");
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

    res.setHeader("Content-Type", result.contentType);
    res.setHeader("X-Frame-Options", "ALLOWALL");
    res.setHeader("Content-Security-Policy", "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;");
    res.send(result.content);
  });

  // API: Get sandbox file listing
  app.get("/api/sandbox/:sandboxId/files", async (req: Request, res: Response) => {
    const { sandboxId } = req.params;

    // Try loading from store if not in memory
    await loadSandboxFromStore(sandboxId);
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
