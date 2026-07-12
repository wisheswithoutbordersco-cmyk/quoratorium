/**
 * Settings Initializer
 * Loads global settings from the API on app mount.
 * Renders nothing — just triggers the settings load.
 */
import { useEffect } from "react";
import { useSettingsStore } from "@/stores/settingsStore";

export function SettingsInitializer() {
  const loadSettings = useSettingsStore((s) => s.loadSettings);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return null;
}
