import { describe, expect, it } from "vitest";
import {
  CAPTAIN_OPENROUTER_MODEL,
  getCaptainReasoning,
  isGpt5Family,
} from "./assistantConfig";

describe("Captain Q model configuration", () => {
  it("uses the current ChatGPT-style multimodal OpenRouter model by default", () => {
    expect(CAPTAIN_OPENROUTER_MODEL).toBe("openai/gpt-5.2-chat");
  });

  it("enables low reasoning for GPT-5 reasoning models", () => {
    expect(isGpt5Family("openai/gpt-5.4")).toBe(true);
    expect(getCaptainReasoning("openai/gpt-5.4")).toEqual({ effort: "low" });
  });

  it("omits unsupported reasoning fields for ChatGPT-style aliases", () => {
    expect(getCaptainReasoning("openai/gpt-5.2-chat")).toBeUndefined();
  });
});
