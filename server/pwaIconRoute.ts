/**
 * PWA Icon Route
 * GET /api/pwa-icon — serves the custom PWA icon from Supabase app_settings,
 * or falls back to the default static icon.
 * 
 * POST /api/settings/pwa-icon — saves a base64-encoded PNG icon to app_settings.
 */
import { Router, Request, Response } from "express";
import path from "path";
import { getSupabaseAdmin } from "./supabase";

export const pwaIconRouter = Router();

/**
 * GET /api/pwa-icon
 * Returns the custom PWA icon if one has been saved, otherwise serves the default.
 */
pwaIconRouter.get("/api/pwa-icon", async (_req: Request, res: Response) => {
  try {
    const db = getSupabaseAdmin();
    if (db) {
      const { data, error } = await db
        .from("app_settings")
        .select("value")
        .eq("key", "pwa_icon")
        .single();

      if (!error && data?.value) {
        // value is stored as JSON: { "base64": "data:image/png;base64,..." } or just the raw base64 string
        let base64Data: string;
        if (typeof data.value === "string") {
          base64Data = data.value;
        } else if (data.value.base64) {
          base64Data = data.value.base64;
        } else {
          // Unexpected format, fall through to default
          return serveDefaultIcon(res);
        }

        // Strip the data URL prefix if present
        const base64Content = base64Data.replace(/^data:image\/png;base64,/, "");
        const buffer = Buffer.from(base64Content, "base64");

        res.set("Content-Type", "image/png");
        res.set("Cache-Control", "public, max-age=3600");
        return res.send(buffer);
      }
    }

    // No custom icon found — serve default
    return serveDefaultIcon(res);
  } catch (err) {
    console.error("[PWA Icon] Error fetching custom icon:", err);
    return serveDefaultIcon(res);
  }
});

/**
 * POST /api/settings/pwa-icon
 * Saves a base64 PNG icon to the app_settings table.
 * Body: { "icon": "data:image/png;base64,..." }
 */
pwaIconRouter.post("/api/settings/pwa-icon", async (req: Request, res: Response) => {
  try {
    const { icon } = req.body;
    if (!icon || typeof icon !== "string") {
      return res.status(400).json({ error: "Missing 'icon' field (base64 PNG string)" });
    }

    // Validate it looks like a base64 PNG
    if (!icon.startsWith("data:image/png;base64,") && !icon.match(/^[A-Za-z0-9+/]+=*$/)) {
      return res.status(400).json({ error: "Icon must be a base64-encoded PNG" });
    }

    const db = getSupabaseAdmin();
    if (!db) {
      return res.status(503).json({ error: "Database not available" });
    }

    // Upsert into app_settings
    const { error } = await db
      .from("app_settings")
      .upsert(
        {
          key: "pwa_icon",
          value: { base64: icon },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );

    if (error) {
      console.error("[PWA Icon] Supabase upsert error:", error);
      return res.status(500).json({ error: "Failed to save icon" });
    }

    return res.json({ success: true, message: "PWA icon saved" });
  } catch (err) {
    console.error("[PWA Icon] Error saving icon:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

function serveDefaultIcon(res: Response) {
  const defaultIconPath = path.resolve(
    process.env.NODE_ENV === "production"
      ? path.join(__dirname, "public", "icon-512x512.png")
      : path.join(__dirname, "..", "client", "public", "icon-512x512.png")
  );
  return res.sendFile(defaultIconPath, (err) => {
    if (err) {
      console.error("[PWA Icon] Failed to serve default icon:", err);
      res.status(404).end();
    }
  });
}
