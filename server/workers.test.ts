import { describe, expect, it, vi, beforeEach } from "vitest";
import { detectIntent, type WorkerIntent } from "./workers";

// Mock OpenAI
vi.mock("openai", () => {
  const mockCreate = vi.fn().mockResolvedValue({
    choices: [{ message: { content: "Generated code output from GPT-4o" } }],
  });
  return {
    default: class OpenAI {
      chat = { completions: { create: mockCreate } };
    },
  };
});

// Mock Anthropic
vi.mock("@anthropic-ai/sdk", () => {
  const mockCreate = vi.fn().mockResolvedValue({
    content: [{ type: "text", text: "Validation report from Claude: Score 9/10" }],
  });
  return {
    default: class Anthropic {
      messages = { create: mockCreate };
    },
  };
});

// Mock the LLM module (Forge fallback)
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: "Forge fallback response" } }],
  }),
}));

describe("detectIntent", () => {
  it("detects research intent", () => {
    expect(detectIntent("Research the latest trends in AI")).toBe("research");
    expect(detectIntent("What is the current market cap of Apple?")).toBe("research");
    expect(detectIntent("Find out who the competitors are")).toBe("research");
    expect(detectIntent("Look up the latest news about React")).toBe("research");
  });

  it("detects build intent", () => {
    expect(detectIntent("Build me a landing page")).toBe("build");
    expect(detectIntent("Create a React dashboard")).toBe("build");
    expect(detectIntent("Generate a REST API in Node.js")).toBe("build");
    expect(detectIntent("Make a website for my startup")).toBe("build");
  });

  it("detects validate intent", () => {
    expect(detectIntent("Review this code for issues")).toBe("validate");
    expect(detectIntent("Check my implementation for bugs")).toBe("validate");
    expect(detectIntent("Audit the page structure")).toBe("validate");
  });

  it("defaults to chat for general messages", () => {
    expect(detectIntent("Hello, how are you?")).toBe("chat");
    expect(detectIntent("Thanks for the help")).toBe("chat");
    expect(detectIntent("Tell me a joke")).toBe("chat");
  });
});

describe("workers with external APIs", () => {
  beforeEach(() => {
    // Set env vars for testing
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    process.env.SONAR_API_KEY = "test-sonar-key";
  });

  it("callCaptain uses OpenAI GPT-4o", async () => {
    const { callCaptain } = await import("./workers");
    const result = await callCaptain([{ role: "user", content: "Hello" }]);
    expect(result).toBe("Generated code output from GPT-4o");
  });

  it("callBuilder uses OpenAI GPT-4o", async () => {
    const { callBuilder } = await import("./workers");
    const result = await callBuilder("Build a landing page", "Startup website");
    expect(result).toBe("Generated code output from GPT-4o");
  });

  it("callValidator uses Anthropic Claude", async () => {
    const { callValidator } = await import("./workers");
    const result = await callValidator("<div>Hello</div>", "Build a page");
    expect(result).toBe("Validation report from Claude: Score 9/10");
  });

  it("callResearch uses Perplexity Sonar", async () => {
    // Mock fetch for Perplexity
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: "Research results from Perplexity Sonar" } }],
      }),
    }) as any;

    const { callResearch } = await import("./workers");
    const result = await callResearch("What are the latest AI trends?");
    expect(result).toBe("Research results from Perplexity Sonar");

    globalThis.fetch = originalFetch;
  });
});

describe("AI router integration", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    process.env.SONAR_API_KEY = "test-sonar-key";
  });

  it("status endpoint reports all workers available", async () => {
    // Import the router and create a caller
    vi.doMock("./db", () => ({
      addConversationMessage: vi.fn().mockResolvedValue(1),
      getConversationHistory: vi.fn().mockResolvedValue([]),
      addOrchestrationEvent: vi.fn().mockResolvedValue(1),
      createProject: vi.fn().mockResolvedValue({}),
      getUserProjects: vi.fn().mockResolvedValue([]),
      getProject: vi.fn().mockResolvedValue(null),
      updateProject: vi.fn().mockResolvedValue({}),
      createGeneratedFile: vi.fn().mockResolvedValue(1),
      getProjectOrchestrationEvents: vi.fn().mockResolvedValue([]),
    }));

    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller({
      user: {
        id: 1,
        openId: "test",
        email: "test@test.com",
        name: "Test",
        loginMethod: "manus",
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: { protocol: "https", headers: {} } as any,
      res: { clearCookie: vi.fn() } as any,
    });

    const status = await caller.ai.status();
    expect(status.captain.available).toBe(true);
    expect(status.captain.provider).toBe("OpenAI GPT-4o");
    expect(status.builder.available).toBe(true);
    expect(status.builder.provider).toBe("OpenAI GPT-4o");
    expect(status.validator.available).toBe(true);
    expect(status.validator.provider).toBe("Anthropic Claude");
    expect(status.research.available).toBe(true);
    expect(status.research.provider).toBe("Perplexity Sonar");
    expect(status.fallback.available).toBe(true);
  });
});
