/**
 * Code Execution Engine
 * 
 * Primary: Sprites.dev (persistent Linux sandboxes via Fly.io)
 * Fallback: Local child_process execution (when Sprites unavailable)
 */
import { spawn } from "child_process";
import { writeFile, unlink, mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { executeCodeInSprite, getSprite, type ExecResult } from "./spritesClient";
import { validateCode } from "./security";
import { logger, startTrace, endTrace, recordMetric } from "./observability";

const MAX_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_SIZE = 50_000;

export interface ExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  duration: number;
  language: string;
  timedOut?: boolean;
  engine: "sprites" | "local";
  spriteName?: string;
  spriteStatus?: string;
}

/**
 * Execute code — tries Sprites.dev first, falls back to local execution
 */
export async function executeCode(
  code: string,
  language: "javascript" | "typescript" | "python" | "bash",
  options: {
    timeoutMs?: number;
    dependencies?: string[];
    spriteName?: string;
    forceLocal?: boolean;
  } = {}
): Promise<ExecutionResult> {
  const { timeoutMs = MAX_TIMEOUT_MS, dependencies, spriteName, forceLocal } = options;
  const startTime = Date.now();
  const span = startTrace("code_execution", { service: "executor", worker: "executor", attributes: { language } });

  // Security: validate code before execution
  const validation = validateCode(code, language);
  if (!validation.safe) {
    logger.warn(`[Security] Code validation failed: ${validation.violations.map(v => v.message).join(", ")}`, { worker: "executor" });
    endTrace(span, "failed");
    recordMetric("code_execution_blocked", 1, "counter", { language });
    return {
      success: false,
      stdout: "",
      stderr: `Security violation: ${validation.violations.map(v => v.message).join("; ")}`,
      exitCode: 1,
      duration: Date.now() - startTime,
      language,
      engine: "local",
    };
  }
  logger.info(`[Executor] Running ${language} code (${code.length} chars)`, { worker: "executor" });

  // Try Sprites.dev first (if token available and not forced local)
  if (!forceLocal && process.env.SPRITES_TOKEN) {
    try {
      const result = await executeViaSprites(code, language, {
        timeoutMs,
        dependencies,
        spriteName,
      });
      endTrace(span, result.success ? "completed" : "failed");
      recordMetric("code_execution_duration_ms", result.duration, "histogram", { language, engine: "sprites" });
      return result;
    } catch (err) {
      console.warn("[CodeExecutor] Sprites.dev failed, falling back to local:", err);
    }
  }

  // Fallback to local execution
  const result = await executeLocally(code, language, timeoutMs, startTime);
  endTrace(span, result.success ? "completed" : "failed");
  recordMetric("code_execution_duration_ms", result.duration, "histogram", { language, engine: "local" });
  return result;
}

/**
 * Execute code via Sprites.dev persistent sandbox
 */
async function executeViaSprites(
  code: string,
  language: "javascript" | "typescript" | "python" | "bash",
  options: {
    timeoutMs?: number;
    dependencies?: string[];
    spriteName?: string;
  }
): Promise<ExecutionResult> {
  const startTime = Date.now();

  const result = await executeCodeInSprite({
    language,
    code,
    dependencies: options.dependencies,
    spriteName: options.spriteName,
  });

  const duration = Date.now() - startTime;
  const { execResult, sprite } = result;

  return {
    success: execResult.exit_code === 0,
    stdout: truncateOutput(execResult.stdout),
    stderr: truncateOutput(execResult.stderr),
    exitCode: execResult.exit_code,
    duration,
    language,
    timedOut: duration >= (options.timeoutMs || MAX_TIMEOUT_MS),
    engine: "sprites",
    spriteName: sprite.name,
    spriteStatus: sprite.status,
  };
}

/**
 * Execute code locally via child_process (fallback)
 */
async function executeLocally(
  code: string,
  language: string,
  timeout: number,
  startTime: number
): Promise<ExecutionResult> {
  const tempDir = await mkdtemp(join(tmpdir(), "q-exec-"));
  let tempFile = "";

  try {
    switch (language) {
      case "javascript":
        tempFile = join(tempDir, "script.mjs");
        await writeFile(tempFile, code, "utf-8");
        return await runProcess("node", [tempFile], timeout, startTime, language);
      case "typescript":
        tempFile = join(tempDir, "script.ts");
        await writeFile(tempFile, code, "utf-8");
        return await runProcess("npx", ["tsx", tempFile], timeout, startTime, language);
      case "python":
        tempFile = join(tempDir, "script.py");
        await writeFile(tempFile, code, "utf-8");
        return await runProcess("python3", [tempFile], timeout, startTime, language);
      case "bash":
        tempFile = join(tempDir, "script.sh");
        await writeFile(tempFile, code, "utf-8");
        return await runProcess("bash", [tempFile], timeout, startTime, language);
      default:
        return {
          success: false,
          stdout: "",
          stderr: `Unsupported language: ${language}`,
          exitCode: 1,
          duration: 0,
          language,
          engine: "local",
        };
    }
  } finally {
    try { if (tempFile) await unlink(tempFile); } catch {}
  }
}

function runProcess(
  command: string,
  args: string[],
  timeout: number,
  startTime: number,
  language: string
): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const proc = spawn(command, args, {
      timeout,
      env: { ...process.env, NODE_ENV: "sandbox" },
      cwd: tmpdir(),
    });

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
      if (stdout.length > MAX_OUTPUT_SIZE) {
        stdout = stdout.slice(0, MAX_OUTPUT_SIZE) + "\n... [output truncated]";
        proc.kill("SIGTERM");
      }
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
      if (stderr.length > MAX_OUTPUT_SIZE) {
        stderr = stderr.slice(0, MAX_OUTPUT_SIZE) + "\n... [output truncated]";
        proc.kill("SIGTERM");
      }
    });

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGKILL");
    }, timeout);

    proc.on("close", (exitCode) => {
      clearTimeout(timer);
      const duration = Date.now() - startTime;
      resolve({
        success: exitCode === 0 && !timedOut,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode,
        duration,
        language,
        timedOut,
        engine: "local",
      });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      const duration = Date.now() - startTime;
      resolve({
        success: false,
        stdout: "",
        stderr: err.message,
        exitCode: 1,
        duration,
        language,
        engine: "local",
      });
    });
  });
}

function truncateOutput(output: string): string {
  if (output.length > MAX_OUTPUT_SIZE) {
    return output.slice(0, MAX_OUTPUT_SIZE) + "\n... [output truncated]";
  }
  return output;
}

/**
 * Get the status of the workspace sprite
 */
export async function getExecutionEngineStatus(): Promise<{
  engine: "sprites" | "local";
  spriteStatus?: string;
  spriteName?: string;
  available: boolean;
}> {
  if (!process.env.SPRITES_TOKEN) {
    return { engine: "local", available: true };
  }

  try {
    const sprite = await getSprite("q-workspace-main");
    return {
      engine: "sprites",
      spriteStatus: sprite.status,
      spriteName: sprite.name,
      available: true,
    };
  } catch {
    return {
      engine: "sprites",
      spriteStatus: "not_created",
      available: true,
    };
  }
}
