/**
 * Settings tRPC Router
 * Handles per-user settings with key-value store (Supabase)
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getSupabaseAdmin } from "../supabase";
import { ENV } from "../_core/env";
import { updateBudgetLimits, updateBudgetPolicy } from "../costService";
import { getNotificationDeliveryStatus } from "../_core/notification";

function getDb() {
  const client = getSupabaseAdmin();
  if (!client) return null;
  return client;
}

// Default settings values
export const VERIFIED_MANUS_MODELS = [
  { id: "gpt-5-nano", label: "GPT-5 nano" },
  { id: "gpt-5-mini", label: "GPT-5 mini" },
  { id: "gpt-5", label: "GPT-5" },
  { id: "gpt-5.5", label: "GPT-5.5" },
  { id: "gemini-3-flash-preview", label: "Gemini 3 Flash (preview)" },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (preview)" },
] as const;

export const DEFAULTS: Record<string, string> = {
  // AI Preferences
  "ai.defaultBuilderModel": "gpt-5-mini",
  "ai.defaultValidatorModel": "gpt-5",
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

const verifiedModelIds = new Set<string>(
  VERIFIED_MANUS_MODELS.map(model => model.id)
);
const BOOLEAN_SETTING_KEYS = new Set([
  "budget.autoPause",
  "notifications.jobCompletion",
  "notifications.budgetWarnings",
  "notifications.errorAlerts",
]);
const SENSITIVE_KEY =
  /(?:token|secret|password|credential|encrypted|api[_-]?key|authorization|session|security)/i;

/** Validates values at the server boundary before they can change runtime behavior. */
export function validateSettings(
  settings: Record<string, string>
): Record<string, string> {
  const validated: Record<string, string> = {};

  for (const [key, value] of Object.entries(settings)) {
    if (
      key === "ai.defaultBuilderModel" ||
      key === "ai.defaultValidatorModel"
    ) {
      if (
        !verifiedModelIds.has(
          value as (typeof VERIFIED_MANUS_MODELS)[number]["id"]
        )
      ) {
        throw new Error(`Unsupported Manus model: ${value}`);
      }
    }

    if (key === "ai.temperature") {
      const temperature = Number(value);
      if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
        throw new Error("AI temperature must be between 0 and 2.");
      }
      validated[key] = String(temperature);
      continue;
    }

    if (key === "ai.maxTokens") {
      const maxTokens = Number(value);
      if (
        !Number.isInteger(maxTokens) ||
        maxTokens < 256 ||
        maxTokens > 128000
      ) {
        throw new Error(
          "Max tokens must be an integer between 256 and 128000."
        );
      }
      validated[key] = String(maxTokens);
      continue;
    }

    if (key === "budget.dailyLimit" || key === "budget.monthlyLimit") {
      const limit = Number(value);
      if (!Number.isFinite(limit) || limit < 0 || limit > 1_000_000) {
        throw new Error(
          "Budget limits must be a number between 0 and 1000000."
        );
      }
      validated[key] = limit.toFixed(2);
      continue;
    }

    if (key === "budget.warningThreshold") {
      const threshold = Number(value);
      if (!Number.isInteger(threshold) || threshold < 1 || threshold > 100) {
        throw new Error(
          "Budget warning threshold must be a whole percentage between 1 and 100."
        );
      }
      validated[key] = String(threshold);
      continue;
    }

    if (BOOLEAN_SETTING_KEYS.has(key)) {
      if (value !== "true" && value !== "false") {
        throw new Error(`${key} must be true or false.`);
      }
    }

    if (
      key === "appearance.theme" &&
      !["light", "dark", "system"].includes(value)
    ) {
      throw new Error("Theme must be light, dark, or system.");
    }
    if (
      key === "appearance.animationIntensity" &&
      !["full", "reduced", "off"].includes(value)
    ) {
      throw new Error("Animation intensity is invalid.");
    }
    if (
      key === "appearance.orchestrationPosition" &&
      !["side", "bottom", "hidden"].includes(value)
    ) {
      throw new Error("Orchestration position is invalid.");
    }

    validated[key] = value;
  }

  return validated;
}

/** Shared runtime resolver for server execution paths; values are always merged with safe defaults. */
export async function getUserSettings(
  userId: number
): Promise<Record<string, string>> {
  const db = getDb();
  if (!db) return { ...DEFAULTS };
  const { data, error } = await db
    .from("user_settings")
    .select("key, value")
    .eq("user_id", userId);
  if (error) return { ...DEFAULTS };
  return (data || []).reduce<Record<string, string>>(
    (settings, row: { key: string; value: string | null }) => ({
      ...settings,
      [row.key]: row.value ?? "",
    }),
    { ...DEFAULTS }
  );
}

async function loadProxyModels(): Promise<{
  state: "configured" | "unavailable" | "degraded";
  models: Array<{ id: string; label: string }>;
  detail: string;
}> {
  if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
    return {
      state: "unavailable",
      models: [],
      detail: "The Manus AI proxy has not been configured for this deployment.",
    };
  }

  try {
    const response = await fetch(
      `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/models`,
      {
        headers: { authorization: `Bearer ${ENV.forgeApiKey}` },
        signal: AbortSignal.timeout(4_000),
      }
    );
    if (!response.ok) throw new Error(`catalog responded ${response.status}`);
    const payload = (await response.json()) as {
      data?: Array<{ id?: string; display_name?: string }>;
    };
    const models = (payload.data || [])
      .filter(
        (model): model is { id: string; display_name?: string } =>
          Boolean(model.id) && verifiedModelIds.has(model.id!)
      )
      .map(model => ({ id: model.id, label: model.display_name || model.id }));
    if (models.length === 0) throw new Error("catalog returned no models");
    return {
      state: "configured",
      models,
      detail: "Model catalog loaded from the configured Manus AI proxy.",
    };
  } catch {
    return {
      state: "degraded",
      models: VERIFIED_MANUS_MODELS.map(model => ({ ...model })),
      detail:
        "The proxy is configured, but its live model catalog could not be checked. Showing the last verified supported IDs.",
    };
  }
}

function configurationState(configured: boolean, detail: string) {
  return {
    state: configured ? ("configured" as const) : ("unavailable" as const),
    detail: configured
      ? detail
      : "No credentials are configured in this deployment.",
  };
}

/** Removes credential-like fields recursively before a user-data export is returned. */
export function sanitizeExportValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeExportValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SENSITIVE_KEY.test(key))
      .map(([key, nested]) => [key, sanitizeExportValue(nested)])
  );
}

async function exportUserData(
  userId: number,
  user: { name?: string | null; email?: string | null }
) {
  const db = getDb();
  if (!db)
    throw new Error(
      "Data export is unavailable because the database is not configured."
    );

  const safeSelect = async (table: string, columns = "*") => {
    const { data, error } = await db
      .from(table)
      .select(columns)
      .eq("user_id", userId);
    if (error) {
      console.warn(
        `[Settings export] Could not export ${table}: ${error.message}`
      );
      return [];
    }
    return (data || []).map(row => sanitizeExportValue(row));
  };

  const [
    projects,
    conversations,
    messages,
    memoryEntries,
    vaultEntries,
    generatedFiles,
    orchestrationEvents,
    jobs,
    apiCalls,
    budgets,
    costAlerts,
    userSettings,
    sharedProjects,
    deployments,
    documents,
    knowledgeBase,
    userMemory,
  ] = await Promise.all([
    safeSelect("projects"),
    safeSelect("conversations"),
    safeSelect("messages"),
    safeSelect("memory_entries"),
    safeSelect("vault_entries"),
    safeSelect("generated_files"),
    safeSelect("orchestration_events"),
    safeSelect("jobs"),
    safeSelect("api_calls"),
    safeSelect("budgets"),
    safeSelect("cost_alerts"),
    safeSelect("user_settings"),
    safeSelect("shared_projects"),
    safeSelect("deployments"),
    safeSelect("documents"),
    safeSelect("knowledge_base"),
    safeSelect("user_memory"),
  ]);

  const vaultMetadataOnly = vaultEntries.map((entry: any) => {
    const { content, file_url, file_key, ...metadata } = entry;
    return metadata;
  });

  return {
    exportedAt: new Date().toISOString(),
    formatVersion: 1,
    profile: { name: user.name || null, email: user.email || null },
    data: {
      projects,
      conversations,
      messages,
      memoryEntries,
      vaultEntries: vaultMetadataOnly,
      generatedFiles,
      orchestrationEvents,
      jobs,
      apiCalls,
      budgets,
      costAlerts,
      settings: userSettings.filter(
        (row: any) => !SENSITIVE_KEY.test(String(row.key || ""))
      ),
      sharedProjects,
      deployments,
      documents,
      knowledgeBase,
      userMemory,
    },
    excluded: [
      "authentication tokens and sessions",
      "encrypted GitHub and platform connection credentials",
      "security and identity internals",
      "embedding vectors and storage access secrets",
      "vault content and external file locations (they may contain secrets)",
    ],
  };
}

export const settingsRouter = router({
  // Get all settings for the current user (merged with defaults)
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return getUserSettings(ctx.user.id);
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
    .input(
      z.object({
        settings: z.record(z.string(), z.string()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new Error("Database not available");

      const validatedSettings = validateSettings(input.settings);
      const entries = Object.entries(validatedSettings);
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

      // Budgets are enforced from the budget table, so keep that source of truth
      // synchronized whenever Settings changes the corresponding preference.
      if (
        "budget.dailyLimit" in validatedSettings ||
        "budget.monthlyLimit" in validatedSettings
      ) {
        await updateBudgetLimits(ctx.user.id, {
          dailyLimit: validatedSettings["budget.dailyLimit"],
          monthlyLimit: validatedSettings["budget.monthlyLimit"],
        });
      }
      if (
        "budget.warningThreshold" in validatedSettings ||
        "budget.autoPause" in validatedSettings
      ) {
        await updateBudgetPolicy(ctx.user.id, {
          warningThreshold: validatedSettings["budget.warningThreshold"]
            ? Number(validatedSettings["budget.warningThreshold"])
            : undefined,
          autoPause: validatedSettings["budget.autoPause"]
            ? validatedSettings["budget.autoPause"] === "true"
            : undefined,
        });
      }

      return { success: true, updated: entries.length };
    }),

  // Reset all settings to defaults
  reset: protectedProcedure.mutation(async ({ ctx }) => {
    const db = getDb();
    if (!db) throw new Error("Database not available");

    await db.from("user_settings").delete().eq("user_id", ctx.user.id);
    await updateBudgetLimits(ctx.user.id, {
      dailyLimit: DEFAULTS["budget.dailyLimit"],
      monthlyLimit: DEFAULTS["budget.monthlyLimit"],
    });
    return { success: true };
  }),

  // Get defaults (for reference)
  defaults: protectedProcedure.query(() => DEFAULTS),

  /**
   * Configuration status is intentionally non-secret: it only reports whether
   * a provider is configured/reachable, never whether a particular key exists.
   */
  runtimeHealth: protectedProcedure.query(async () => {
    const proxy = await loadProxyModels();
    const notifications = getNotificationDeliveryStatus();
    return {
      models: proxy.models,
      services: [
        {
          id: "manus-ai-proxy",
          name: "Manus AI proxy",
          ...proxy,
          models: undefined,
        },
        {
          id: "openai-direct",
          name: "OpenAI direct fallback",
          ...configurationState(
            Boolean(process.env.OPENAI_API_KEY),
            "A direct fallback is configured."
          ),
        },
        {
          id: "anthropic-direct",
          name: "Anthropic direct fallback",
          ...configurationState(
            Boolean(process.env.ANTHROPIC_API_KEY),
            "A direct fallback is configured."
          ),
        },
        {
          id: "openrouter",
          name: "OpenRouter fallback",
          ...configurationState(
            Boolean(process.env.OPENROUTER_API_KEY),
            "A direct fallback is configured."
          ),
        },
        {
          id: "perplexity",
          name: "Perplexity research",
          ...configurationState(
            Boolean(process.env.SONAR_API_KEY),
            "The research provider is configured."
          ),
        },
        {
          id: "notifications",
          name: "In-app notifications",
          state: notifications.configured
            ? ("configured" as const)
            : ("unavailable" as const),
          detail: notifications.detail,
        },
      ],
    };
  }),

  /** A user-scoped JSON data portability export. Credential tables are never queried. */
  exportData: protectedProcedure.mutation(async ({ ctx }) => {
    return exportUserData(ctx.user.id, ctx.user);
  }),
});
