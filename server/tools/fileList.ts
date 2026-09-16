/**
 * Tool: list_files
 * Lists all files in the user's current (or specified) sandbox so Captain Q
 * can see what already exists — even after a server restart.
 */
import { registerTool, type ToolContext, type ToolResult } from "./index";

const MAX_LIST_OUTPUT = 8000;

registerTool({
  name: "list_files",
  description: "List all files in the current project sandbox with filename, size, and language. Use this BEFORE creating files to see what already exists, and whenever the user asks what files exist or asks you to inspect existing work.",
  parameters: {
    type: "object",
    properties: {
      sandbox_id: {
        type: "string",
        description: "Optional sandbox ID (e.g. 'sb-a5daa2c1'). If omitted, finds the user's sandbox automatically (including after restarts).",
      },
    },
    required: [],
    additionalProperties: false,
  },
  async execute(args: Record<string, any>, context: ToolContext): Promise<ToolResult> {
    const { getSandboxFiles, loadSandboxFromStore, resolveUserSandboxId } = await import("../sandbox/projectStore");

    const sandboxId: string | undefined = args.sandbox_id || (await resolveUserSandboxId(context.userId));

    if (!sandboxId) {
      return { success: true, output: "No sandbox exists yet for this user. No files have been created.", data: { files: [] } };
    }

    await loadSandboxFromStore(sandboxId);
    const files = getSandboxFiles(sandboxId);

    if (files.length === 0) {
      return { success: true, output: `Sandbox ${sandboxId} exists but contains no files.`, data: { sandboxId, files: [] } };
    }

    const lines = files.map((f) => `- ${f.filename} (${f.content ? f.content.length : 0} bytes, ${f.language})`);
    let output = `Sandbox ${sandboxId} — ${files.length} file(s):\n${lines.join("\n")}`;
    if (output.length > MAX_LIST_OUTPUT) {
      output = output.slice(0, MAX_LIST_OUTPUT) + `\n... (truncated; ${files.length} files total)`;
    }

    return {
      success: true,
      output,
      data: { sandboxId, files: files.map((f) => ({ filename: f.filename, bytes: f.content?.length || 0, language: f.language })) },
    };
  },
});
