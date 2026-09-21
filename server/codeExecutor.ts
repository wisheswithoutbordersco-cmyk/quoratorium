/**
 * Code Execution Engine
 *
 * Untrusted code runs only in a short-lived E2B sandbox with no internet access
 * and no application environment variables. There is deliberately no local
 * child-process fallback: server credentials and the host filesystem must never
 * be reachable from generated code.
 */
import { Sandbox } from "e2b";
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
  engine: "e2b";
  sandboxId?: string;
}

function failure(
  language: string,
  startTime: number,
  stderr: string,
  options: { exitCode?: number | null; timedOut?: boolean } = {}
): ExecutionResult {
  return {
    success: false,
    stdout: "",
    stderr,
    exitCode: options.exitCode ?? 1,
    duration: Date.now() - startTime,
    language,
    timedOut: options.timedOut,
    engine: "e2b",
  };
}

/**
 * Execute untrusted code in a fresh sandbox. Dependencies are intentionally not
 * installable because internet access is disabled for the entire sandbox.
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
  const startTime = Date.now();
  const timeoutMs = Math.max(
    1_000,
    Math.min(options.timeoutMs || MAX_TIMEOUT_MS, MAX_TIMEOUT_MS)
  );
  const span = startTrace("code_execution", {
    service: "executor",
    worker: "executor",
    attributes: { language, engine: "e2b", internetAccess: false },
  });

  if (!process.env.E2B_API_KEY) {
    endTrace(span, "failed");
    return failure(
      language,
      startTime,
      "Secure code execution is unavailable because E2B is not configured."
    );
  }
  if (options.forceLocal) {
    endTrace(span, "failed");
    return failure(
      language,
      startTime,
      "Local code execution is disabled by security policy."
    );
  }
  if (options.dependencies?.length) {
    endTrace(span, "failed");
    return failure(
      language,
      startTime,
      "Dependency installation is disabled in the network-isolated code sandbox."
    );
  }

  const validation = validateCode(code, language);
  if (!validation.safe) {
    const message = validation.violations
      .map(violation => violation.message)
      .join("; ");
    logger.warn(`[Security] Code validation failed: ${message}`, {
      worker: "executor",
    });
    endTrace(span, "failed");
    recordMetric("code_execution_blocked", 1, "counter", { language });
    return failure(language, startTime, `Security violation: ${message}`);
  }

  let sandbox: Sandbox | null = null;
  try {
    sandbox = await Sandbox.create({
      apiKey: process.env.E2B_API_KEY,
      allowInternetAccess: false,
      envs: {},
      secure: true,
      timeoutMs: timeoutMs + 5_000,
    });

    const fileByLanguage: Record<string, string> = {
      javascript: "/tmp/toriu-code.mjs",
      typescript: "/tmp/toriu-code.ts",
      python: "/tmp/toriu-code.py",
      bash: "/tmp/toriu-code.sh",
    };
    const commandByLanguage: Record<string, string> = {
      javascript:
        "env -i PATH=/usr/local/bin:/usr/bin:/bin node /tmp/toriu-code.mjs",
      typescript:
        "env -i PATH=/usr/local/bin:/usr/bin:/bin npx --offline tsx /tmp/toriu-code.ts",
      python:
        "env -i PATH=/usr/local/bin:/usr/bin:/bin python3 /tmp/toriu-code.py",
      bash: "env -i PATH=/usr/local/bin:/usr/bin:/bin bash /tmp/toriu-code.sh",
    };
    const filename = fileByLanguage[language];
    const command = commandByLanguage[language];
    if (!filename || !command) {
      endTrace(span, "failed");
      return failure(language, startTime, `Unsupported language: ${language}`);
    }

    await sandbox.files.write(filename, code);
    const result = await sandbox.commands.run(command, { timeoutMs });
    const duration = Date.now() - startTime;
    const execution: ExecutionResult = {
      success: result.exitCode === 0,
      stdout: truncateOutput(result.stdout || ""),
      stderr: truncateOutput(result.stderr || result.error || ""),
      exitCode: result.exitCode,
      duration,
      language,
      timedOut: duration >= timeoutMs,
      engine: "e2b",
      sandboxId: sandbox.sandboxId,
    };
    endTrace(span, execution.success ? "completed" : "failed");
    recordMetric(
      "code_execution_duration_ms",
      execution.duration,
      "histogram",
      {
        language,
        engine: "e2b",
        internetAccess: "false",
      }
    );
    return execution;
  } catch (error: any) {
    endTrace(span, "failed");
    return failure(
      language,
      startTime,
      `Secure sandbox execution failed: ${String(error?.message || "unknown error").slice(0, 500)}`,
      { timedOut: error?.name === "TimeoutError" }
    );
  } finally {
    if (sandbox) {
      try {
        await sandbox.kill();
      } catch {
        logger.warn("Could not terminate E2B code sandbox", {
          service: "executor",
          metadata: { sandboxId: sandbox.sandboxId },
        });
      }
    }
  }
}

function truncateOutput(output: string): string {
  if (output.length > MAX_OUTPUT_SIZE) {
    return `${output.slice(0, MAX_OUTPUT_SIZE)}\n... [output truncated]`;
  }
  return output.trim();
}

export async function getExecutionEngineStatus(): Promise<{
  engine: "e2b";
  available: boolean;
  networkAccess: "disabled";
  localFallback: false;
}> {
  return {
    engine: "e2b",
    available: Boolean(process.env.E2B_API_KEY),
    networkAccess: "disabled",
    localFallback: false,
  };
}
