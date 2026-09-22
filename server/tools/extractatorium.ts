import { isCapabilityEnabled } from "../actionCatalog";
import {
  analyzeWithExtractorium,
  loadOwnerImageAttachment,
  recordPrioritySuiteAudit,
  type ExtractoriumOperation,
} from "../prioritySuiteService";
import { registerTool, type ToolContext, type ToolResult } from "./index";

const CAPABILITY_ID = "extractorium.document.read";

registerTool({
  name: "extractatorium_process",
  description:
    "Use the secured Extractorium service to read and clean text from one image attached to the current message, or to create a faithful visual recreation description. This is a read/analysis action only and never publishes or changes the source file.",
  parameters: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: ["process", "analyzeVision"],
        description:
          "Use process to transcribe and organize visible document text. Use analyzeVision for a faithful visual recreation description.",
      },
    },
    required: ["operation"],
    additionalProperties: false,
  },
  async execute(
    args: Record<string, any>,
    context: ToolContext
  ): Promise<ToolResult> {
    if (!isCapabilityEnabled(CAPABILITY_ID)) {
      return {
        success: false,
        output: "The Extractorium capability is disabled.",
      };
    }

    const userId = Number(context.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return {
        success: false,
        output: "A verified workspace owner session is required.",
      };
    }

    const operation: ExtractoriumOperation =
      args.operation === "analyzeVision" ? "analyzeVision" : "process";
    let assetName = "attached image";
    try {
      const image = await loadOwnerImageAttachment(
        userId,
        context.durableAttachmentIds || []
      );
      assetName = image.name;
      const result = await analyzeWithExtractorium(operation, image);
      await recordPrioritySuiteAudit({
        system: "Extractorium",
        capability: CAPABILITY_ID,
        eventType: "extractorium_document_analyzed",
        userId,
        projectId: context.projectId,
        operation,
        assetName,
        outcome: "completed",
      });

      if (operation === "process") {
        const cleanedText =
          typeof result.cleanedText === "string" ? result.cleanedText : "";
        const rawText =
          typeof result.rawText === "string" ? result.rawText : "";
        const usefulText = cleanedText || rawText;
        return {
          success: true,
          output: usefulText
            ? `Extractorium read and organized ${assetName}:\n\n${usefulText.slice(0, 14_000)}`
            : `Extractorium processed ${assetName}, but returned no readable text.`,
          data: {
            capability: CAPABILITY_ID,
            operation,
            assetName,
            result,
          },
        };
      }

      const description =
        typeof result.description === "string" ? result.description : "";
      return {
        success: true,
        output: description
          ? `Extractorium described ${assetName}:\n\n${description.slice(0, 14_000)}`
          : `Extractorium analyzed ${assetName}, but returned no description.`,
        data: {
          capability: CAPABILITY_ID,
          operation,
          assetName,
          result,
        },
      };
    } catch (error) {
      await recordPrioritySuiteAudit({
        system: "Extractorium",
        capability: CAPABILITY_ID,
        eventType: "extractorium_document_analysis_failed",
        userId,
        projectId: context.projectId,
        operation,
        assetName,
        outcome: "failed",
      });
      return {
        success: false,
        output:
          error instanceof Error
            ? error.message
            : "Extractorium could not complete the analysis.",
      };
    }
  },
});
