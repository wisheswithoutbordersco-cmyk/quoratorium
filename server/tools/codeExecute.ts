/**
 * Tool: run_code
 * Execute code in a sandboxed environment and return the output
 */
import { registerTool, type ToolContext, type ToolResult } from "./index";
import { executeCode } from "../codeExecutor";

registerTool({
  name: "run_code",
  description: "Execute code in a sandboxed environment. Supports JavaScript, TypeScript, and Python. Returns stdout, stderr, and execution status. Use this to test code, run scripts, or compute results.",
  parameters: {
    type: "object",
    properties: {
      code: {
        type: "string",
        description: "The code to execute",
      },
      language: {
        type: "string",
        enum: ["javascript", "typescript", "python"],
        description: "The programming language to execute",
      },
    },
    required: ["code", "language"],
    additionalProperties: false,
  },
  async execute(args: Record<string, any>, _context: ToolContext): Promise<ToolResult> {
    const { code, language } = args;

    if (!code || !language) {
      return { success: false, output: "Missing code or language" };
    }

    const validLangs = ["javascript", "typescript", "python"];
    if (!validLangs.includes(language)) {
      return { success: false, output: `Unsupported language: ${language}. Use: ${validLangs.join(", ")}` };
    }

    try {
      const result = await executeCode(code, language, { timeoutMs: 30000 });

      if (result.success) {
        return {
          success: true,
          output: `Execution successful (${result.duration}ms):\n${result.stdout || "(no output)"}${result.stderr ? `\nWarnings: ${result.stderr}` : ""}`,
          data: { stdout: result.stdout, stderr: result.stderr, duration: result.duration },
        };
      } else {
        return {
          success: false,
          output: `Execution failed (${result.duration}ms):\n${result.stderr || result.stdout || "Unknown error"}`,
          data: { stdout: result.stdout, stderr: result.stderr, duration: result.duration, timedOut: result.timedOut },
        };
      }
    } catch (err: any) {
      return { success: false, output: `Execution error: ${err?.message || "Unknown error"}` };
    }
  },
});
