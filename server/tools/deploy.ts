/**
 * Tool: deploy_project
 * Deploy the current sandbox project to a live URL
 */
import { registerTool, type ToolContext, type ToolResult } from "./index";
import { deploySandbox, getSandboxUrl } from "../sandbox/projectStore";

registerTool({
  name: "deploy_project",
  description: "Deploy the current project files to a live sandboxed URL that the user can visit. Use this after creating files to give the user a working preview they can interact with. The URL will be accessible immediately.",
  parameters: {
    type: "object",
    properties: {
      sandboxId: {
        type: "string",
        description: "The sandbox ID to deploy (from a previous create_file call). If not provided, deploys the most recent sandbox for this user.",
      },
    },
    required: [],
    additionalProperties: false,
  },
  async execute(args: Record<string, any>, context: ToolContext): Promise<ToolResult> {
    const { sandboxId } = args;

    try {
      const result = await deploySandbox(context.userId, sandboxId);

      if (!result.success) {
        return { success: false, output: result.error || "Deployment failed" };
      }

      const url = getSandboxUrl(result.sandboxId!);

      return {
        success: true,
        output: `Project deployed successfully!\n\nLive URL: ${url}\n\nThe user can view the project at this URL. You can update the files and redeploy to the same URL.`,
        artifacts: [{
          type: "url",
          name: "Live Preview",
          url,
        }],
        data: { sandboxId: result.sandboxId, url },
      };
    } catch (err: any) {
      return { success: false, output: `Deployment failed: ${err?.message || "Unknown error"}` };
    }
  },
});
