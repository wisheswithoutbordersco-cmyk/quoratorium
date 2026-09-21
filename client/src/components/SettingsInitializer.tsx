/**
 * Settings Initializer
 * Loads global settings only after Clerk verifies an authenticated workspace
 * session. Renders nothing — just triggers the settings load.
 */
import { useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useSettingsStore } from "@/stores/settingsStore";

export function SettingsInitializer() {
  const { isAuthenticated, loading } = useAuth();
  const loadSettings = useSettingsStore(s => s.loadSettings);

  useEffect(() => {
    if (loading || !isAuthenticated) return;
    loadSettings();
  }, [isAuthenticated, loadSettings, loading]);

  return null;
}
