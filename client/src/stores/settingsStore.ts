/**
 * Q Workspace — Global Settings Store
 *
 * Loads user settings from the API once on app init, caches in memory.
 * All components can access settings without re-fetching.
 * When user changes a setting, the store updates immediately (optimistic)
 * and persists to API in background with debounce.
 */
import { create } from "zustand";

// ─── Types ──────────────────────────────────────────────────────────────────

export type Theme = "dark" | "light" | "system";
export type AnimationIntensity = "full" | "reduced" | "off";
export type OrchestrationPosition = "side" | "bottom" | "hidden";

export interface AppSettings {
  // AI Preferences
  "ai.defaultBuilderModel": string;
  "ai.defaultValidatorModel": string;
  "ai.temperature": string;
  "ai.maxTokens": string;
  // Budget
  "budget.dailyLimit": string;
  "budget.monthlyLimit": string;
  "budget.warningThreshold": string;
  "budget.autoPause": string;
  // Appearance
  "appearance.theme": Theme;
  "appearance.animationIntensity": AnimationIntensity;
  "appearance.orchestrationPosition": OrchestrationPosition;
  // Notifications
  "notifications.jobCompletion": string;
  "notifications.budgetWarnings": string;
  "notifications.errorAlerts": string;
  // Allow arbitrary keys
  [key: string]: string;
}

// ─── Defaults ───────────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS: AppSettings = {
  "ai.defaultBuilderModel": "gpt-5-mini",
  "ai.defaultValidatorModel": "gpt-5",
  "ai.temperature": "0.7",
  "ai.maxTokens": "4096",
  "budget.dailyLimit": "10",
  "budget.monthlyLimit": "100",
  "budget.warningThreshold": "80",
  "budget.autoPause": "true",
  "appearance.theme": "dark",
  "appearance.animationIntensity": "full",
  "appearance.orchestrationPosition": "side",
  "notifications.jobCompletion": "true",
  "notifications.budgetWarnings": "true",
  "notifications.errorAlerts": "true",
};

// ─── Store Interface ────────────────────────────────────────────────────────

interface SettingsState {
  settings: AppSettings;
  isLoaded: boolean;
  isLoading: boolean;

  // Actions
  loadSettings: () => Promise<void>;
  updateSetting: (key: string, value: string) => void;
  resetSettings: () => Promise<void>;
  getSetting: (key: string) => string;

  // Computed helpers
  theme: () => Theme;
  animationIntensity: () => AnimationIntensity;
  orchestrationPosition: () => OrchestrationPosition;
}

// ─── Debounced Persist ──────────────────────────────────────────────────────

let persistTimer: ReturnType<typeof setTimeout> | null = null;
const pendingUpdates: Record<string, string> = {};
let removeSystemThemeListener: (() => void) | null = null;

async function persistToAPI(updates: Record<string, string>) {
  try {
    await fetch("/api/trpc/settings.update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ json: { settings: updates } }),
    });
  } catch {
    // Silently fail — settings will be re-synced on next load
  }
}

function debouncedPersist(key: string, value: string) {
  pendingUpdates[key] = value;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const updates = { ...pendingUpdates };
    Object.keys(pendingUpdates).forEach(k => delete pendingUpdates[k]);
    persistToAPI(updates);
  }, 800);
}

/** Cancels writes scheduled before a reset so defaults cannot be overwritten later. */
function cancelPendingPersistence() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  Object.keys(pendingUpdates).forEach(key => delete pendingUpdates[key]);
}

// ─── Store ──────────────────────────────────────────────────────────────────

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: { ...DEFAULT_SETTINGS },
  isLoaded: false,
  isLoading: false,

  loadSettings: async () => {
    if (get().isLoaded || get().isLoading) return;
    set({ isLoading: true });

    try {
      const response = await fetch("/api/trpc/settings.getAll", {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        // tRPC batch response format
        const result = data?.result?.data?.json || data?.result?.data || data;
        if (result && typeof result === "object") {
          set({
            settings: { ...DEFAULT_SETTINGS, ...result } as AppSettings,
            isLoaded: true,
            isLoading: false,
          });
          // Apply theme immediately
          applyTheme((result as any)["appearance.theme"] || "dark");
          applyAnimationIntensity(
            (result as any)["appearance.animationIntensity"] || "full"
          );
          applyOrchestrationPosition(
            (result as any)["appearance.orchestrationPosition"] || "side"
          );
          return;
        }
      }
    } catch {
      // Fall through to defaults
    }

    set({ isLoaded: true, isLoading: false });
  },

  updateSetting: (key: string, value: string) => {
    // Optimistic update
    set(state => ({
      settings: { ...state.settings, [key]: value },
    }));

    // Apply side effects immediately
    if (key === "appearance.theme") applyTheme(value as Theme);
    if (key === "appearance.animationIntensity")
      applyAnimationIntensity(value as AnimationIntensity);
    if (key === "appearance.orchestrationPosition")
      applyOrchestrationPosition(value as OrchestrationPosition);

    // Debounced persist to API
    debouncedPersist(key, value);
  },

  resetSettings: async () => {
    cancelPendingPersistence();
    set({ settings: { ...DEFAULT_SETTINGS } });
    applyTheme("dark");
    applyAnimationIntensity("full");
    applyOrchestrationPosition("side");
    try {
      await fetch("/api/trpc/settings.reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ json: {} }),
      });
    } catch {
      // Defaults remain applied locally and will be retried by the next explicit change.
    }
  },

  getSetting: (key: string) => {
    return get().settings[key] || DEFAULT_SETTINGS[key] || "";
  },

  // Computed helpers
  theme: () => (get().settings["appearance.theme"] || "dark") as Theme,
  animationIntensity: () =>
    (get().settings["appearance.animationIntensity"] ||
      "full") as AnimationIntensity,
  orchestrationPosition: () =>
    (get().settings["appearance.orchestrationPosition"] ||
      "side") as OrchestrationPosition,
}));

// ─── Side Effect Helpers ────────────────────────────────────────────────────

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  removeSystemThemeListener?.();
  removeSystemThemeListener = null;

  const setResolvedTheme = (resolvedTheme: "light" | "dark") => {
    root.style.colorScheme = resolvedTheme;
    root.dataset.themePreference = theme;
    if (resolvedTheme === "light") {
      root.classList.remove("dark");
      root.classList.add("light");
    } else {
      root.classList.remove("light");
      root.classList.add("dark");
    }
  };

  if (theme === "system") {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applySystemTheme = () =>
      setResolvedTheme(media.matches ? "dark" : "light");
    applySystemTheme();
    media.addEventListener("change", applySystemTheme);
    removeSystemThemeListener = () =>
      media.removeEventListener("change", applySystemTheme);
    return;
  }

  setResolvedTheme(theme);
}

function applyOrchestrationPosition(position: OrchestrationPosition) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.orchestrationPosition = position;
  root.style.setProperty("--orchestration-position", position);
}

function applyAnimationIntensity(intensity: AnimationIntensity) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  // Set CSS custom property for animation duration multiplier
  switch (intensity) {
    case "full":
      root.style.setProperty("--animation-multiplier", "1");
      root.style.setProperty("--animation-enabled", "1");
      break;
    case "reduced":
      root.style.setProperty("--animation-multiplier", "0.3");
      root.style.setProperty("--animation-enabled", "1");
      break;
    case "off":
      root.style.setProperty("--animation-multiplier", "0");
      root.style.setProperty("--animation-enabled", "0");
      break;
  }
}
