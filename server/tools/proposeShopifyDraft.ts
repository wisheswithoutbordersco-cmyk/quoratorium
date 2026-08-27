import { registerTool, type ToolContext, type ToolResult } from "./index";
import { proposeShopifyProductDraft } from "../shopifyDrafts";

registerTool({
  name: "propose_shopify_product_draft",
  description:
    "Create a reviewable Shopify PRODUCT DRAFT proposal only when the user explicitly asks to add, create, prepare, or list a product in Shopify. This tool never contacts Shopify and never publishes anything. Do not use it for brainstorming, writing product copy, image analysis, or prompt writing unless the user also explicitly asks to prepare a Shopify draft. After using it, tell the user to review the proposal card and confirm or cancel it.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string", description: "Product title, 3 to 255 characters." },
      descriptionHtml: { type: "string", description: "Complete Shopify product description in simple HTML." },
      price: { type: "number", minimum: 0, maximum: 1000000, description: "Single-variant price in store currency." },
      vendor: { type: "string", description: "Optional vendor or shop brand." },
      productType: { type: "string", description: "Optional Shopify product type." },
      tags: {
        type: "array",
        maxItems: 50,
        items: { type: "string" },
        description: "Optional organization and search tags.",
      },
      seoTitle: { type: "string", description: "Optional SEO title, at most 70 characters." },
      seoDescription: { type: "string", description: "Optional SEO description, at most 320 characters." },
      imageAttachmentIds: {
        type: "array",
        maxItems: 10,
        items: { type: "string" },
        description: "Optional durable attachment IDs from the current message. Omit to use all current durable image attachments.",
      },
    },
    required: ["title", "descriptionHtml", "price"],
  },
  async execute(args: Record<string, any>, context: ToolContext): Promise<ToolResult> {
    const userId = Number(context.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return { success: false, output: "A verified owner session is required to create a Shopify proposal." };
    }

    const availableIds = new Set(context.durableAttachmentIds || []);
    const requestedIds = Array.isArray(args.imageAttachmentIds)
      ? args.imageAttachmentIds.filter((id: unknown): id is string => typeof id === "string" && availableIds.has(id))
      : Array.from(availableIds);

    const action = await proposeShopifyProductDraft({
      userId,
      conversationId: context.conversationId || undefined,
      product: {
        title: args.title,
        descriptionHtml: args.descriptionHtml,
        price: args.price,
        vendor: args.vendor,
        productType: args.productType,
        tags: Array.isArray(args.tags) ? args.tags : [],
        seoTitle: args.seoTitle,
        seoDescription: args.seoDescription,
        imageUrls: [],
        imageAssetIds: requestedIds,
      },
    });

    return {
      success: true,
      output: `Created Shopify draft proposal ${action.id} for review. No store change has occurred. The owner must confirm the proposal card before execution.`,
      data: {
        businessAction: action,
        requiresConfirmation: true,
        storeChanged: false,
      },
    };
  },
});
