import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./businessCredentials", async importOriginal => {
  const actual = await importOriginal<typeof import("./businessCredentials")>();
  return {
    ...actual,
    getStoredShopifyConnection: vi.fn(),
  };
});

vi.mock("./chatAssets", () => ({
  resolveChatAssetSignedUrls: vi.fn().mockResolvedValue([]),
}));

import { getStoredShopifyConnection } from "./businessCredentials";
import type { BusinessAction } from "./businessActions";
import {
  clearShopifyTokenCache,
  executeShopifyProductDraft,
} from "./shopifyDrafts";

function action(id: string): BusinessAction {
  return {
    id,
    userId: 7,
    type: "shopify.create_product_draft",
    status: "executing",
    summary: "Create Shopify draft: ELA Challenge Board",
    payload: {
      title: "ELA Challenge Board",
      descriptionHtml: "<p>Digital classroom game.</p>",
      price: 2.99,
      tags: ["ELA"],
      imageUrls: [],
      imageAssetIds: [],
    },
    preview: { status: "DRAFT" },
    idempotencyKey: `idempotency-${id}`,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    version: 1,
  };
}

function draftResponse(id: string) {
  return new Response(JSON.stringify({
    data: {
      productSet: {
        product: {
          id: `gid://shopify/Product/${id}`,
          title: "ELA Challenge Board",
          handle: `captain-q-draft-${id}`,
          status: "DRAFT",
          variants: { nodes: [{ id: `gid://shopify/ProductVariant/${id}`, price: "2.99" }] },
          media: { nodes: [] },
        },
        userErrors: [],
      },
    },
  }), { status: 200 });
}

beforeEach(() => {
  vi.clearAllMocks();
  clearShopifyTokenCache();
  vi.mocked(getStoredShopifyConnection).mockResolvedValue({
    authMode: "client_credentials",
    shopDomain: "example-store.myshopify.com",
    clientId: "shopify_client_id",
    clientSecret: "shopify_client_secret_value",
  });
});

describe("Shopify client credential token renewal", () => {
  it("reuses one access token until shortly before its 24-hour expiration", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "temporary_token_one",
        scope: "write_products",
        expires_in: 86399,
      }), { status: 200 }))
      .mockResolvedValueOnce(draftResponse("1"))
      .mockResolvedValueOnce(draftResponse("2"));

    await executeShopifyProductDraft(action("1"), { fetchImpl });
    await executeShopifyProductDraft(action("2"), { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls.filter(([url]) => String(url).includes("/admin/oauth/access_token"))).toHaveLength(1);
    for (const call of fetchImpl.mock.calls.slice(1)) {
      expect(call[1].headers["X-Shopify-Access-Token"]).toBe("temporary_token_one");
    }
  });

  it("automatically exchanges credentials again when the cached token is near expiration", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "temporary_token_one",
        scope: "write_products",
        expires_in: 1,
      }), { status: 200 }))
      .mockResolvedValueOnce(draftResponse("1"))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "temporary_token_two",
        scope: "write_products",
        expires_in: 86399,
      }), { status: 200 }))
      .mockResolvedValueOnce(draftResponse("2"));

    await executeShopifyProductDraft(action("1"), { fetchImpl });
    await executeShopifyProductDraft(action("2"), { fetchImpl });

    expect(fetchImpl.mock.calls.filter(([url]) => String(url).includes("/admin/oauth/access_token"))).toHaveLength(2);
    expect(fetchImpl.mock.calls[3][1].headers["X-Shopify-Access-Token"]).toBe("temporary_token_two");
  });
});
