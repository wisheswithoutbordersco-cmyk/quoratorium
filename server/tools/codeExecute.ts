/**
 * Tool: run_code
 * Execute code in an ephemeral, credential-free, internet-disabled sandbox.
 */
import { registerTool, type ToolContext, type ToolResult } from "./index";
import { executeCode } from "../codeExecutor";

registerTool({
  name: "run_code",
  description:
    "Execute JavaScript, TypeScript, or Python for calculations, data transformation, and isolated code checks. The sandbox has no application credentials, no host access, no dependency installation, and no internet access. Do not use it for GitHub or other external service actions.",
  parameters: {
    type: "object",
    properties: {
      code: {
        type: "string",
        description:
          "Self-contained code to execute without network access or external dependencies.",
      },
      language: {
        type: "string",
        enum: ["javascript", "typescript", "python"],
        description: "The programming language to execute.",
      },
    },
    required: ["code", "language"],
    additionalProperties: false,
  },
  async execute(
    args: Record<string, any>,
    _context: ToolContext
  ): Promise<ToolResult> {
    const code = typeof args.code === "string" ? args.code : "";
    const language = typeof args.language === "string" ? args.language : "";
    const validLanguages = ["javascript", "typescript", "python"] as const;

    if (
      !code ||
      !validLanguages.includes(language as (typeof validLanguages)[number])
    ) {
      return {
        success: false,
        output: `Missing or unsupported language. Use: ${validLanguages.join(", ")}.`,
      };
    }

    try {
      const result = await executeCode(
        code,
        language as (typeof validLanguages)[number],
        { timeoutMs: 30_000 }
      );
      if (result.success) {
        return {
          success: true,
          output: `Execution successful in an isolated offline sandbox (${result.duration}ms):\n${result.stdout || "(no output)"}${result.stderr ? `\nWarnings: ${result.stderr}` : ""}`,
          data: {
            stdout: result.stdout,
            stderr: result.stderr,
            duration: result.duration,
            engine: result.engine,
            networkAccess: "disabled",
          },
        };
      }
      return {
        success: false,
        output: `Execution failed in the isolated offline sandbox (${result.duration}ms):\n${result.stderr || result.stdout || "Unknown error"}`,
        data: {
          stdout: result.stdout,
          stderr: result.stderr,
          duration: result.duration,
          timedOut: result.timedOut,
          engine: result.engine,
          networkAccess: "disabled",
        },
      };
    } catch (error: any) {
      return {
        success: false,
        output: `Execution error: ${error?.message || "Unknown error"}`,
      };
    }
  },
});
