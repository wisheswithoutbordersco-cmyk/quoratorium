import { beforeEach, describe, expect, it, vi } from "vitest";

const { sandboxKill, sandboxWrite, sandboxRun, sandboxCreate } = vi.hoisted(
  () => ({
    sandboxKill: vi.fn(),
    sandboxWrite: vi.fn(),
    sandboxRun: vi.fn(),
    sandboxCreate: vi.fn(),
  })
);

vi.mock("e2b", () => ({
  Sandbox: {
    create: sandboxCreate,
  },
}));

vi.mock("./observability", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
  startTrace: vi.fn(() => ({ traceId: "t", spanId: "s" })),
  endTrace: vi.fn(),
  recordMetric: vi.fn(),
}));

import { executeCode } from "./codeExecutor";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.E2B_API_KEY = "test-e2b-key";
  sandboxRun.mockResolvedValue({ exitCode: 0, stdout: "4\n", stderr: "" });
  sandboxCreate.mockResolvedValue({
    sandboxId: "sandbox-1",
    files: { write: sandboxWrite },
    commands: { run: sandboxRun },
    kill: sandboxKill,
  });
});

describe("secure code executor", () => {
  it("creates an ephemeral sandbox with internet and inherited environment disabled", async () => {
    const result = await executeCode("print(2 + 2)", "python");

    expect(result.success).toBe(true);
    expect(result.engine).toBe("e2b");
    expect(sandboxCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "test-e2b-key",
        allowInternetAccess: false,
        envs: {},
        secure: true,
      })
    );
    expect(sandboxRun).toHaveBeenCalledWith(
      expect.stringContaining("env -i"),
      expect.objectContaining({ timeoutMs: 30_000 })
    );
    expect(sandboxKill).toHaveBeenCalledTimes(1);
  });

  it("never falls back to local execution when the secure sandbox is unavailable", async () => {
    delete process.env.E2B_API_KEY;
    const result = await executeCode("console.log(process.env)", "javascript");

    expect(result.success).toBe(false);
    expect(result.stderr).toContain("E2B is not configured");
    expect(sandboxCreate).not.toHaveBeenCalled();
  });

  it("rejects explicit local execution and dependency installation", async () => {
    const local = await executeCode("console.log(1)", "javascript", {
      forceLocal: true,
    });
    const dependencies = await executeCode("print(1)", "python", {
      dependencies: ["requests"],
    });

    expect(local.success).toBe(false);
    expect(local.stderr).toContain("Local code execution is disabled");
    expect(dependencies.success).toBe(false);
    expect(dependencies.stderr).toContain(
      "Dependency installation is disabled"
    );
    expect(sandboxCreate).not.toHaveBeenCalled();
  });
});
