import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeCode, getExecutionEngineStatus } from "./codeExecutor";

const originalNodeEnv = process.env.NODE_ENV;
const originalSpritesToken = process.env.SPRITES_TOKEN;

beforeEach(() => {
  process.env.NODE_ENV = "production";
  delete process.env.SPRITES_TOKEN;
});

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  if (originalSpritesToken === undefined) delete process.env.SPRITES_TOKEN;
  else process.env.SPRITES_TOKEN = originalSpritesToken;
});

describe("production code execution containment", () => {
  it("reports execution unavailable without an isolated engine", async () => {
    await expect(getExecutionEngineStatus()).resolves.toEqual({
      engine: "disabled",
      available: false,
    });
  });

  it("does not run code on the application host", async () => {
    const result = await executeCode("console.log('must-not-run')", "javascript");
    expect(result.success).toBe(false);
    expect(result.engine).toBe("disabled");
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Local host execution is disabled in production");
  });
});
