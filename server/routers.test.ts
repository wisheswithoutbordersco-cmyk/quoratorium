import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the database module
vi.mock("./db", () => ({
  addConversationMessage: vi.fn().mockResolvedValue(1),
  getConversationHistory: vi.fn().mockResolvedValue([]),
  addOrchestrationEvent: vi.fn().mockResolvedValue(1),
  createProject: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    name: "Test Project",
    description: "A test project",
    projectType: "website",
    status: "active",
    currentPhase: 1,
    totalPhases: 16,
    phases: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  getUserProjects: vi.fn().mockResolvedValue([
    {
      id: 1,
      userId: 1,
      name: "Test Project",
      description: "A test project",
      projectType: "website",
      status: "active",
      currentPhase: 1,
      totalPhases: 16,
      phases: null,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]),
  getProject: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    name: "Test Project",
    description: "A test project",
    projectType: "website",
    status: "completed",
    currentPhase: 3,
    totalPhases: 3,
    phases: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  updateProject: vi.fn().mockResolvedValue({}),
  getProjectFiles: vi.fn().mockResolvedValue([
    {
      id: 1,
      projectId: 1,
      userId: 1,
      filename: "index.html",
      filepath: "index.html",
      content: "<html><body>Hello</body></html>",
      language: "html",
      createdAt: new Date(),
    },
    {
      id: 2,
      projectId: 1,
      userId: 1,
      filename: "style.css",
      filepath: "style.css",
      content: "body { margin: 0; }",
      language: "css",
      createdAt: new Date(),
    },
  ]),
  createGeneratedFile: vi.fn().mockResolvedValue(1),
  createMemoryEntry: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    category: "context",
    title: "Test Memory",
    content: "Test content",
    tags: null,
    importance: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  getUserMemory: vi.fn().mockResolvedValue([]),
  deleteMemoryEntry: vi.fn().mockResolvedValue(undefined),
  createVaultEntry: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    name: "Test File",
    entryType: "file",
    content: null,
    fileUrl: "/manus-storage/test.txt",
    fileKey: "test.txt",
    mimeType: "text/plain",
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  getUserVault: vi.fn().mockResolvedValue([]),
  deleteVaultEntry: vi.fn().mockResolvedValue(undefined),
  getProjectOrchestrationEvents: vi.fn().mockResolvedValue([]),
}));

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: "Hello! I'm Captain Q. How can I help you today?" } }],
  }),
}));

// Mock storage
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ key: "test-key", url: "/manus-storage/test-key" }),
}));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-openid",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("projects router", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    const ctx = createAuthContext();
    caller = appRouter.createCaller(ctx);
  });

  it("lists projects", async () => {
    const result = await caller.projects.list();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Test Project");
  });

  it("creates a project", async () => {
    const result = await caller.projects.create({
      name: "Test Project",
      description: "A test project",
      projectType: "website",
    });
    expect(result).toBeDefined();
    expect(result.name).toBe("Test Project");
    expect(result.projectType).toBe("website");
  });

  it("gets project files", async () => {
    const result = await caller.projects.getFiles({ projectId: 1 });
    expect(result).toHaveLength(2);
    expect(result[0].filename).toBe("index.html");
    expect(result[1].filename).toBe("style.css");
  });

  it("downloads project as ZIP", async () => {
    const result = await caller.projects.downloadZip({ projectId: 1 });
    expect(result).toBeDefined();
    expect(result.url).toContain("/manus-storage/");
    expect(result.fileCount).toBe(2);
    expect(result.filename).toBe("Test Project.zip");
  });

  it("gets project stats", async () => {
    const result = await caller.projects.getStats();
    expect(result).toBeDefined();
    expect(result.totalProjects).toBe(1);
    expect(result.activeProjects).toBe(1);
  });
});

describe("ai router", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    const ctx = createAuthContext();
    caller = appRouter.createCaller(ctx);
  });

  it("sends a chat message and gets AI response", async () => {
    const result = await caller.ai.chat({ message: "Hello Captain Q" });
    expect(result).toBeDefined();
    expect(result.role).toBe("assistant");
    expect(result.content).toContain("Captain Q");
    expect(result.timestamp).toBeGreaterThan(0);
  });

  it("gets conversation history", async () => {
    const result = await caller.ai.getHistory({});
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("memory router", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    const ctx = createAuthContext();
    caller = appRouter.createCaller(ctx);
  });

  it("creates a memory entry", async () => {
    const result = await caller.memory.create({
      title: "Test Memory",
      content: "Test content",
      category: "context",
    });
    expect(result).toBeDefined();
    expect(result.title).toBe("Test Memory");
  });

  it("lists memory entries", async () => {
    const result = await caller.memory.list();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("files router", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    const ctx = createAuthContext();
    caller = appRouter.createCaller(ctx);
  });

  it("uploads a file", async () => {
    const result = await caller.files.upload({
      filename: "test.txt",
      fileBase64: Buffer.from("Hello World").toString("base64"),
      mimeType: "text/plain",
    });
    expect(result).toBeDefined();
    expect(result.url).toContain("/manus-storage/");
    expect(result.filename).toBe("test.txt");
    expect(result.mimeType).toBe("text/plain");
  });
});
