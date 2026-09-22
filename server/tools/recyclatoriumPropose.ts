import { isCapabilityEnabled } from "../actionCatalog";
import { resolveChatAssetRecords } from "../chatAssets";
import {
  analyzeRecyclatoriumAssets,
  RECYCLATORIUM_MAX_ASSET_BYTES,
  RECYCLATORIUM_MAX_TOTAL_BYTES,
} from "../recyclatoriumService";
import { registerTool, type ToolContext, type ToolResult } from "./index";

const CAPABILITY_ID = "recyclatorium.product_plan.propose";
const FETCH_TIMEOUT_MS = 30_000;

async function downloadAsDataUrl(asset: {
  name: string;
  type: string;
  url: string;
}): Promise<{ name: string; mimeType: string; dataUrl: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(asset.url, {
      headers: { Accept: asset.type },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Could not load ${asset.name} (${response.status}).`);
    }
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > RECYCLATORIUM_MAX_ASSET_BYTES) {
      throw new Error(
        `${asset.name} is larger than the 7 MB Recyclatorium limit.`
      );
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (
      bytes.byteLength === 0 ||
      bytes.byteLength > RECYCLATORIUM_MAX_ASSET_BYTES
    ) {
      throw new Error(`${asset.name} must be between 1 byte and 7 MB.`);
    }
    return {
      name: asset.name,
      mimeType: asset.type,
      dataUrl: `data:${asset.type};base64,${bytes.toString("base64")}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

registerTool({
  name: "recyclatorium_propose",
  description:
    "Create a reviewable Recyclatorium printable-product plan from the image attachments in the user's current message. Use only when the user explicitly asks to recombine, transform, repurpose, or invent a product from those attached assets. This analyzes the files but does not export, publish, or modify another system.",
  parameters: {
    type: "object",
    properties: {
      mode: {
        type: "string",
        enum: ["recombine", "transform", "invent"],
        description: "How Recyclatorium should use the attached source assets.",
      },
      instructions: {
        type: "string",
        description:
          "Optional concise owner direction for the proposed product.",
        maxLength: 1200,
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
        output: "The Recyclatorium proposal capability is disabled.",
      };
    }

    const userId = Number(context.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return {
        success: false,
        output: "A verified workspace owner session is required.",
      };
    }

    const assetIds = context.durableAttachmentIds?.slice(0, 6) || [];
    if (assetIds.length === 0) {
      return {
        success: false,
        output:
          "Attach one to six PNG, JPEG, WebP, or GIF images in this message, then ask me to recombine, transform, or invent from them.",
      };
    }

    const records = await resolveChatAssetRecords(userId, assetIds);
    if (records.length === 0) {
      return {
        success: false,
        output:
          "I could not retrieve the attached images from your owner-scoped storage.",
      };
    }

    let totalBytes = 0;
    const assets = [] as Array<{
      name: string;
      mimeType: string;
      dataUrl: string;
    }>;
    for (const record of records) {
      totalBytes += record.size;
      if (totalBytes > RECYCLATORIUM_MAX_TOTAL_BYTES) {
        return {
          success: false,
          output:
            "The attached images exceed Recyclatorium's combined 20 MB limit.",
        };
      }
      assets.push(await downloadAsDataUrl(record));
    }

    const mode = ["recombine", "transform", "invent"].includes(args.mode)
      ? args.mode
      : "transform";
    const result = await analyzeRecyclatoriumAssets({
      userId,
      projectId: context.projectId,
      mode,
      assets,
      instructions:
        typeof args.instructions === "string" ? args.instructions : undefined,
    });

    return {
      success: true,
      output: `Recyclatorium created a reviewable plan titled “${result.plan.title}” with ${result.plan.activities.length} activities. Nothing was published or exported.`,
      data: {
        capability: CAPABILITY_ID,
        plan: result.plan,
        model: result.model,
        fallbackUsed: result.fallbackUsed,
      },
    };
  },
});
