import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shopifyDrafts", () => ({
  proposeShopifyProductDraft: vi.fn(),
}));

import { proposeShopifyProductDraft } from "../shopifyDrafts";
import { getTool } from "./index";
import "./proposeShopifyDraft";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("propose_shopify_product_draft tool", () => {
  it("creates a proposal only and restricts images to current durable attachments", async () => {
    vi.mocked(proposeShopifyProductDraft).mockResolvedValue({
      id: "81",
      userId: 7,
      type: "shopify.create_product_draft",
      status: "proposed",
      summary: "Create Shopify draft: Birthday Invitation",
      payload: {},
      preview: { status: "DRAFT" },
      idempotencyKey: "abc",
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      version: 1,
    });

    const tool = getTool("propose_shopify_product_draft");
    expect(tool).toBeDefined();
    const result = await tool!.execute({
      title: "Birthday Invitation",
      descriptionHtml: "<p>Printable invitation.</p>",
      price: 8.99,
      imageAttachmentIds: ["11", "not-owned"],
    }, {
      userId: "7",
      conversationId: 42,
      durableAttachmentIds: ["11", "12"],
    });

    expect(proposeShopifyProductDraft).toHaveBeenCalledWith({
      userId: 7,
      conversationId: 42,
      product: expect.objectContaining({
        title: "Birthday Invitation",
        price: 8.99,
        imageAssetIds: ["11"],
        imageUrls: [],
      }),
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual(expect.objectContaining({
      requiresConfirmation: true,
      storeChanged: false,
      businessAction: expect.objectContaining({ status: "proposed" }),
    }));
    expect(result.output).toContain("No store change has occurred");
  });
});
