import { isCapabilityEnabled } from "../actionCatalog";
import {
  detectWithTemplatorium,
  loadOwnerImageAttachment,
  recordPrioritySuiteAudit,
  type TemplatoriumMode,
} from "../prioritySuiteService";
import { registerTool, type ToolContext, type ToolResult } from "./index";

const CAPABILITY_ID = "templatorium.text_regions.read";

registerTool({
  name: "templatorium_detect_text",
  description:
    "Use the secured Templatorium vision service to detect visible text and its page coordinates in one image attached to the current message. This reads the image only; it never edits, exports, or publishes a template.",
  parameters: {
    type: "object",
    properties: {
      mode: {
        type: "string",
        enum: ["global", "tile"],
        description:
          "Use global for a full page. Use tile only when analyzing an already-cropped dense section.",
      },
    },
    required: ["mode"],
    additionalProperties: false,
  },
  async execute(
    args: Record<string, any>,
    context: ToolContext
  ): Promise<ToolResult> {
    if (!isCapabilityEnabled(CAPABILITY_ID)) {
      return {
        success: false,
        output: "The Templatorium capability is disabled.",
      };
    }

    const userId = Number(context.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return {
        success: false,
        output: "A verified workspace owner session is required.",
      };
    }

    const mode: TemplatoriumMode = args.mode === "tile" ? "tile" : "global";
    let assetName = "attached image";
    try {
      const image = await loadOwnerImageAttachment(
        userId,
        context.durableAttachmentIds || []
      );
      assetName = image.name;
      const result = await detectWithTemplatorium(mode, image);
      const regions = Array.isArray(result.regions) ? result.regions : [];
      await recordPrioritySuiteAudit({
        system: "Templatorium",
        capability: CAPABILITY_ID,
        eventType: "templatorium_text_detected",
        userId,
        projectId: context.projectId,
        operation: mode,
        assetName,
        outcome: "completed",
        resultCount: regions.length,
      });

      const serialized = JSON.stringify(
        {
          documentType: result.documentType,
          coverageConfidence: result.coverageConfidence,
          recommendRecovery: result.recommendRecovery,
          regions,
        },
        null,
        2
      );
      return {
        success: true,
        output: `Templatorium detected ${regions.length} text region${regions.length === 1 ? "" : "s"} in ${assetName}.\n\n${serialized.slice(0, 14_000)}`,
        data: {
          capability: CAPABILITY_ID,
          mode,
          assetName,
          result,
        },
      };
    } catch (error) {
      await recordPrioritySuiteAudit({
        system: "Templatorium",
        capability: CAPABILITY_ID,
        eventType: "templatorium_text_detection_failed",
        userId,
        projectId: context.projectId,
        operation: mode,
        assetName,
        outcome: "failed",
      });
      return {
        success: false,
        output:
          error instanceof Error
            ? error.message
            : "Templatorium could not complete text detection.",
      };
    }
  },
});
