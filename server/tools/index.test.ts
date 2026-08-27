import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerTool, runToolLoop } from "./index";

const response = (message: Record<string, unknown>) => ({
  ok: true,
  json: async () => ({ choices: [{ message }] }),
  text: async () => "",
});

describe("runToolLoop", () => {
  const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;
  const fetchMock = vi.fn();

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    if (originalOpenRouterKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalOpenRouterKey;
    vi.unstubAllGlobals();
  });

  it("keeps a valid no-tool answer and calls the model only once", async () => {
    fetchMock.mockResolvedValueOnce(response({ role: "assistant", content: "That's Chucky." }));

    const result = await runToolLoop(
      [
        { role: "system", content: "You are Captain Q." },
        { role: "user", content: "What is this character's name?" },
      ],
      { userId: "owner" },
      "openai/gpt-5.2-chat",
    );

    expect(result).toEqual({ response: "That's Chucky.", toolsUsed: [], artifacts: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.model).toBe("openai/gpt-5.2-chat");
    expect(payload.tool_choice).toBe("auto");
    expect(payload.messages[0].content.match(/You are Captain Q\./g)).toHaveLength(1);
    expect(payload.messages[0].content).toContain("Tools are optional capabilities");
  });

  it("retries a compatible OpenRouter model when the preferred model is rejected", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => "unsupported model",
      })
      .mockResolvedValueOnce(response({ role: "assistant", content: "Captain Q is online." }));

    const result = await runToolLoop(
      [{ role: "user", content: "Say hello" }],
      { userId: "owner" },
      "openai/unavailable-model",
    );

    expect(result.response).toBe("Captain Q is online.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryPayload = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(retryPayload.model).toBe("openai/gpt-5");
  });

  it("executes a selected tool and returns the model's final answer", async () => {
    registerTool({
      name: "test_lookup",
      description: "Test-only lookup tool",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      execute: async () => ({ success: true, output: "verified result" }),
    });

    fetchMock
      .mockResolvedValueOnce(response({
        role: "assistant",
        content: "",
        tool_calls: [{ id: "call-1", type: "function", function: { name: "test_lookup", arguments: "{}" } }],
      }))
      .mockResolvedValueOnce(response({ role: "assistant", content: "Here is the verified result." }));

    const result = await runToolLoop(
      [{ role: "user", content: "Look this up" }],
      { userId: "owner" },
      "openai/gpt-5.2-chat",
    );

    expect(result.response).toBe("Here is the verified result.");
    expect(result.toolsUsed).toEqual(["test_lookup"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
