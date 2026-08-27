import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./env", () => ({
  ENV: {
    forgeApiUrl: "https://forge.example.test",
    forgeApiKey: "test-key",
  },
}));

import { invokeLLM } from "./llm";

describe("invokeLLM model configuration", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "response-1",
        created: 1,
        model: "test",
        choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the requested GPT-5 model with GPT-family completion and reasoning settings", async () => {
    await invokeLLM({
      model: "gpt-5",
      messages: [{ role: "user", content: "Hello" }],
      max_completion_tokens: 4096,
      reasoning: { effort: "low" },
    });

    const request = fetchMock.mock.calls[0][1];
    const payload = JSON.parse(request.body);
    expect(payload).toMatchObject({
      model: "gpt-5",
      max_completion_tokens: 4096,
      reasoning: { effort: "low" },
    });
    expect(payload).not.toHaveProperty("max_tokens");
    expect(payload).not.toHaveProperty("thinking");
  });

  it("uses max_tokens for non-GPT models and only sends thinking when requested", async () => {
    await invokeLLM({
      model: "gemini-3-flash-preview",
      messages: [{ role: "user", content: "Hello" }],
      max_tokens: 2048,
      thinking: { type: "enabled", budget_tokens: 512 },
    });

    const request = fetchMock.mock.calls[0][1];
    const payload = JSON.parse(request.body);
    expect(payload).toMatchObject({
      model: "gemini-3-flash-preview",
      max_tokens: 2048,
      thinking: { type: "enabled", budget_tokens: 512 },
    });
    expect(payload).not.toHaveProperty("max_completion_tokens");
  });
});
