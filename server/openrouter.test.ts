import { describe, it, expect } from "vitest";
import OpenAI from "openai";

describe("OpenRouter API key validation", () => {
  it("should have OPENROUTER_API_KEY set", () => {
    expect(process.env.OPENROUTER_API_KEY).toBeTruthy();
    expect(process.env.OPENROUTER_API_KEY!.length).toBeGreaterThan(10);
  });

  it("should successfully call OpenRouter with deepseek/deepseek-chat", async () => {
    const openrouter = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://quoratorium.com",
        "X-Title": "Quoratorium",
      },
    });

    const response = await openrouter.chat.completions.create({
      model: "deepseek/deepseek-chat",
      messages: [{ role: "user", content: "Say 'ok' in one word." }],
      max_tokens: 5,
    });

    expect(response.choices).toBeDefined();
    expect(response.choices.length).toBeGreaterThan(0);
    const content = response.choices[0]?.message?.content;
    expect(content).toBeTruthy();
  }, 30000);
});
