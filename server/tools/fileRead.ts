/**
 * Tool: read_file
 * Reads the contents of a file from the user's current (or specified) sandbox.
 */
import { registerTool, type ToolContext, type ToolResult } from "./index";

const MAX_CONTENT_CHARS = 30000;

registerTool({
  name: "read_file",
  description: "Read the full contents of a file from the project sandbox. Use this to inspect existing code before editing, to verify what was previously built, or when the user asks what is inside a file.",
  parameters: {
    type: "object",
    properties: {
      filename: {
        type: "string",
        description: "The filename to read (e.g., 'index.html', 'app.js')",
      },
      sandbox_id: {
        type: "string",
        description: "Optional sandbox ID. If omitted, uses the user's most recent sandbox.",
      },
    },
    required: ["filename"],
    additionalProperties: false,
  },
  async execute(args: Record<string, any>, context: ToolContext): Promise<ToolResult> {
    const { getUserSandboxId, getSandboxFile, getSandboxFiles, loadSandboxFromStore } = await import("../sandbox/projectStore");

    const filename = args.filename;
    if (!filename) {
      return { success: false, output: "Missing filename" };
    }

    const sandboxId: string | undefined = args.sandbox_id || getUserSandboxId(context.userId);
    if (!sandboxId) {
      return { success: false, output: "No sandbox found for this user. Nothing has been created yet." };
    }

    // Load from Supabase if the server restarted since the file was written
    if (!getSandboxFile(sandboxId, filename)) {
      await loadSandboxFromStore(sandboxId);
    }

    const file = getSandboxFile(sandboxId, filename);
    if (!file) {
      const available = getSandboxFiles(sandboxId).map((f) => f.filename);
      return {
        success: false,
        output: `File not found: ${filename}. Files in sandbox ${sandboxId}: ${available.join(", ") || "(none)"}`,
      };
    }

    let content = file.content || "";
    let truncated = false;
    if (content.length > MAX_CONTENT_CHARS) {
      content = content.slice(0, MAX_CONTENT_CHARS);
      truncated = true;
    }

    return {
      success: true,
      output: `File: ${file.filename} (${file.language})\n\n${content}${truncated ? "\n\n... [truncated]" : ""}`,
      data: { sandboxId, filename: file.filename, truncated },
      artifacts: [{ type: "file", name: file.filename, content: file.content, language: file.language }],
    };
  },
});
