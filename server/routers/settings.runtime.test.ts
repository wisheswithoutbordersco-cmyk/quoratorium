import { describe, expect, it } from "vitest";
import {
  DEFAULTS,
  sanitizeExportValue,
  validateSettings,
  VERIFIED_MANUS_MODELS,
} from "./settings";

describe("settings runtime safeguards", () => {
  it("uses verified current Manus model defaults", () => {
    const supported = new Set(VERIFIED_MANUS_MODELS.map(model => model.id));
    expect(supported.has(DEFAULTS["ai.defaultBuilderModel"] as any)).toBe(true);
    expect(supported.has(DEFAULTS["ai.defaultValidatorModel"] as any)).toBe(true);
  });

  it("accepts supported execution preferences and normalizes numeric values", () => {
    expect(validateSettings({
      "ai.defaultBuilderModel": "gpt-5-mini",
      "ai.defaultValidatorModel": "gemini-3-flash-preview",
      "ai.temperature": "1.25",
      "ai.maxTokens": "8192",
      "budget.warningThreshold": "90",
      "budget.autoPause": "false",
    })).toEqual({
      "ai.defaultBuilderModel": "gpt-5-mini",
      "ai.defaultValidatorModel": "gemini-3-flash-preview",
      "ai.temperature": "1.25",
      "ai.maxTokens": "8192",
      "budget.warningThreshold": "90",
      "budget.autoPause": "false",
    });
  });

  it("rejects stale models and unsafe AI preferences", () => {
    expect(() => validateSettings({ "ai.defaultBuilderModel": "gpt-4o" })).toThrow("Unsupported Manus model");
    expect(() => validateSettings({ "ai.temperature": "2.1" })).toThrow("temperature");
    expect(() => validateSettings({ "ai.maxTokens": "255" })).toThrow("Max tokens");
  });

  it("removes credential-like fields recursively from exports", () => {
    expect(sanitizeExportValue({
      title: "project",
      token_encrypted: "must-not-export",
      nested: { apiKey: "must-not-export", safe: "included" },
      items: [{ secret: "must-not-export", name: "safe" }],
    })).toEqual({
      title: "project",
      nested: { safe: "included" },
      items: [{ name: "safe" }],
    });
  });
});
