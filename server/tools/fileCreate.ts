/**
 * Tool: create_file
 * Creates or updates files in the user's project sandbox
 */
import { registerTool, type ToolContext, type ToolResult } from "./index";

registerTool({
  name: "create_file",
  description: "Create or update a file with the given content. Use this to write HTML, CSS, JavaScript, TypeScript, Python, or any text file. For web projects, create index.html as the entry point.",
  parameters: {
    type: "object",
    properties: {
      filename: {
        type: "string",
        description: "The filename including extension (e.g., 'index.html', 'styles.css', 'app.js', 'components/Header.tsx')",
      },
      content: {
        type: "string",
        description: "The full file content to write",
      },
      language: {
        type: "string",
        description: "The programming language (html, css, javascript, typescript, python, json, etc.)",
      },
    },
    required: ["filename", "content"],
    additionalProperties: false,
  },
  async execute(args: Record<string, any>, context: ToolContext): Promise<ToolResult> {
    const { filename, content, language } = args;

    if (!filename || !content) {
      return { success: false, output: "Missing filename or content" };
    }

    // Store the file in the sandbox project store (will be created in sandbox/projectStore.ts)
    const { addFileToSandbox } = await import("../sandbox/projectStore");
    const result = await addFileToSandbox(context.userId, context.projectId || null, filename, content, language);

    return {
      success: true,
      output: `Created file: ${filename} (${content.length} bytes)`,
      artifacts: [{
        type: "file",
        name: filename,
        content,
        language: language || inferLanguage(filename),
      }],
      data: { sandboxId: result.sandboxId, filename },
    };
  },
});

function inferLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    html: "html", htm: "html", css: "css", js: "javascript",
    ts: "typescript", tsx: "tsx", jsx: "jsx", py: "python",
    json: "json", md: "markdown", yaml: "yaml", yml: "yaml",
    sh: "bash", sql: "sql",
  };
  return map[ext] || "text";
}
