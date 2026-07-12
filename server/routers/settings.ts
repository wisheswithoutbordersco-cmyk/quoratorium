/**
 * Settings tRPC Router
 * Handles per-user settings with key-value store (Supabase)
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getSupabaseAdmin } from "../supabase";

function getDb() {
  const client = getSupabaseAdmin();
  if (!client) return null;
  return client;
}

// Default settings values
const DEFAULTS: Record<string, string> = {
  // AI Preferences
  "ai.defaultBuilderModel": "gpt-4o",
  "ai.defaultValidatorModel": "claude-sonnet",
  "ai.temperature": "0.7",
  "ai.maxTokens": "4096",
  // Budget
  "budget.dailyLimit": "10",
  "budget.monthlyLimit": "100",
  "budget.warningThreshold": "80",
  "budget.autoPause": "true",
  // Appearance
  "appearance.theme": "dark",
  "appearance.animationIntensity": "full",
  "appearance.orchestrationPosition": "side",
  // Notifications
  "notifications.jobCompletion": "true",
  "notifications.budgetWarnings": "true",
  "notifications.errorAlerts": "true",
};

export const settingsRouter = router({
  // Get all settings for the current user (merged with defaults)
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const db = getDb();
    if (!db) return DEFAULTS;

    const { data: rows } = await db
      .from("user_settings")
      .select("key, value")
      .eq("user_id", ctx.user.id);

    const settings: Record<string, string> = { ...DEFAULTS };
    for (const row of rows || []) {
      settings[row.key] = row.value || "";
    }
    return settings;
  }),

  // Get a single setting
  get: protectedProcedure
    .input(z.object({ key: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) return DEFAULTS[input.key] || null;

      const { data: row } = await db
        .from("user_settings")
        .select("value")
        .eq("user_id", ctx.user.id)
        .eq("key", input.key)
        .single();

      return row?.value || DEFAULTS[input.key] || null;
    }),

  // Update one or more settings (upsert)
  update: protectedProcedure
    .input(z.object({
      settings: z.record(z.string(), z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new Error("Database not available");

      const entries = Object.entries(input.settings);
      for (const [key, value] of entries) {
        // Upsert: try update, then insert if not exists
        const { data: existing } = await db
          .from("user_settings")
          .select("id")
          .eq("user_id", ctx.user.id)
          .eq("key", key)
          .single();

        if (existing) {
          await db
            .from("user_settings")
            .update({ value })
            .eq("user_id", ctx.user.id)
            .eq("key", key);
        } else {
          await db
            .from("user_settings")
            .insert({ user_id: ctx.user.id, key, value });
        }
      }

      return { success: true, updated: entries.length };
    }),

  // Reset all settings to defaults
  reset: protectedProcedure.mutation(async ({ ctx }) => {
    const db = getDb();
    if (!db) throw new Error("Database not available");

    await db.from("user_settings").delete().eq("user_id", ctx.user.id);
    return { success: true };
  }),

  // Get defaults (for reference)
  defaults: protectedProcedure.query(() => DEFAULTS),
});
