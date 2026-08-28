import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./businessActions", async importOriginal => {
  const actual = await importOriginal<typeof import("./businessActions")>();
  return {
    ...actual,
    createBusinessAction: vi.fn(),
    editBusinessAction: vi.fn(),
    getBusinessAction: vi.fn(),
  };
});

vi.mock("./chatAssets", async importOriginal => {
  const actual = await importOriginal<typeof import("./chatAssets")>();
  return {
    ...actual,
    listConversationImageAssetIds: vi.fn(),
  };
});

import {
  createBusinessAction,
  editBusinessAction,
  getBusinessAction,
  type BusinessAction,
} from "./businessActions";
import { listConversationImageAssetIds } from "./chatAssets";
import {
  exchangeShopifyClientCredentials,
  editShopifyProductDraft,
  executeShopifyProductDraft,
  proposeShopifyProductDraft,
  SHOPIFY_API_VERSION,
  verifyShopifyClientCredentials,
  verifyShopifyConnection,
} from "./shopifyDrafts";

const product = {
  title: "Printable Birthday Invitation",
  descriptionHtml: "<p>Editable digital invitation.</p>",
  price: "8.99",
  vendor: "Wishes Without Borders",
  productType: "Digital invitation",
  tags: ["birthday", "printable"],
  imageUrls: ["https://storage.example.com/invitation.jpg?signature=temporary"],
};

function action(status: BusinessAction["status"] = "executing"): BusinessAction {
  return {
    id: "14",
    userId: 1,
    type: "shopify.create_product_draft",
    status,
    summary: `Create Shopify draft: ${product.title}`,
    payload: product,
    preview: {},
    idempotencyKey: "abcdef1234567890abcdef1234567890",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    version: 1,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Shopify product draft actions", () => {
  it("creates a proposal only and does not contact Shopify", async () => {
    vi.mocked(createBusinessAction).mockResolvedValue(action("proposed"));
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await proposeShopifyProductDraft({
      userId: 1,
      conversationId: 42,
      product,
    });

    expect(result.status).toBe("proposed");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(createBusinessAction).toHaveBeenCalledWith(expect.objectContaining({
      userId: 1,
      type: "shopify.create_product_draft",
      conversationId: 42,
      preview: expect.objectContaining({
        status: "DRAFT",
        publishesAutomatically: false,
        price: "8.99",
      }),
    }));
    fetchSpy.mockRestore();
  });

  it("recovers the same conversation's durable image when editing an older zero-image proposal", async () => {
    const current = { ...action("proposed"), conversationId: 42, payload: { ...product, imageUrls: [], imageAssetIds: [] } };
    vi.mocked(getBusinessAction).mockResolvedValue(current);
    vi.mocked(listConversationImageAssetIds).mockResolvedValue(["91"]);
    vi.mocked(editBusinessAction).mockImplementation(async input => ({
      ...current,
      payload: input.payload,
      preview: input.preview,
    }));

    const result = await editShopifyProductDraft({
      userId: 1,
      actionId: current.id,
      product: {
        ...product,
        imageUrls: [],
        imageAssetIds: [],
      },
    });

    expect(listConversationImageAssetIds).toHaveBeenCalledWith(1, 42);
    expect(editBusinessAction).toHaveBeenCalledWith(expect.objectContaining({
      userId: 1,
      actionId: current.id,
      payload: expect.objectContaining({ imageAssetIds: ["91"] }),
      preview: expect.objectContaining({ imageCount: 1, status: "DRAFT" }),
    }));
    expect(result.preview).toEqual(expect.objectContaining({ imageCount: 1 }));
  });

  it("exchanges client credentials for a 24-hour token using Shopify's official form request", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "temporary_access_token_value",
      scope: "read_products,write_products",
      expires_in: 86399,
    }), { status: 200 }));

    const before = Date.now();
    const result = await exchangeShopifyClientCredentials({
      shopDomain: "example-store.myshopify.com",
      clientId: "shopify_client_id",
      clientSecret: "shopify_client_secret_value",
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://example-store.myshopify.com/admin/oauth/access_token");
    expect(init.headers).toEqual({ "Content-Type": "application/x-www-form-urlencoded" });
    const form = new URLSearchParams(String(init.body));
    expect(Object.fromEntries(form)).toEqual({
      grant_type: "client_credentials",
      client_id: "shopify_client_id",
      client_secret: "shopify_client_secret_value",
    });
    expect(result.accessToken).toBe("temporary_access_token_value");
    expect(result.scopes).toContain("write_products");
    expect(result.expiresAt).toBeGreaterThanOrEqual(before + 86_398_000);
  });

  it("rejects client credentials whose installed app version lacks write_products", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "temporary_read_only_token",
      scope: "read_products",
      expires_in: 86399,
    }), { status: 200 }));

    await expect(exchangeShopifyClientCredentials({
      shopDomain: "example-store.myshopify.com",
      clientId: "shopify_client_id",
      clientSecret: "shopify_client_secret_value",
      fetchImpl,
    })).rejects.toThrow("write_products");
  });

  it("exchanges client credentials and verifies store identity without making a mutation", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "temporary_access_token_value",
        scope: "read_products,write_products",
        expires_in: 86399,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          shop: { name: "Example Store", myshopifyDomain: "example-store.myshopify.com" },
          currentAppInstallation: {
            accessScopes: [{ handle: "read_products" }, { handle: "write_products" }],
          },
        },
      }), { status: 200 }));

    await expect(verifyShopifyClientCredentials({
      shopDomain: "example-store.myshopify.com",
      clientId: "shopify_client_id",
      clientSecret: "shopify_client_secret_value",
      fetchImpl,
    })).resolves.toEqual({
      shopDomain: "example-store.myshopify.com",
      shopName: "Example Store",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const verificationBody = JSON.parse(String(fetchImpl.mock.calls[1][1].body));
    expect(verificationBody.query).toContain("CaptainQVerifyShopifyConnection");
    expect(verificationBody.query).not.toContain("mutation");
  });

  it("verifies store identity and write_products without making a mutation", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        shop: { name: "Example Store", myshopifyDomain: "example-store.myshopify.com" },
        currentAppInstallation: {
          accessScopes: [{ handle: "read_products" }, { handle: "write_products" }],
        },
      },
    }), { status: 200 }));

    await expect(verifyShopifyConnection({
      shopDomain: "example-store.myshopify.com",
      accessToken: "shpat_test_token_for_connection",
      fetchImpl,
    })).resolves.toEqual({
      shopDomain: "example-store.myshopify.com",
      shopName: "Example Store",
    });
    const body = JSON.parse(String(fetchImpl.mock.calls[0][1].body));
    expect(body.query).toContain("CaptainQVerifyShopifyConnection");
    expect(body.query).not.toContain("mutation");
  });

  it("rejects a Shopify token without write_products permission", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        shop: { name: "Example Store", myshopifyDomain: "example-store.myshopify.com" },
        currentAppInstallation: { accessScopes: [{ handle: "read_products" }] },
      },
    }), { status: 200 }));

    await expect(verifyShopifyConnection({
      shopDomain: "example-store.myshopify.com",
      accessToken: "shpat_read_only_connection_token",
      fetchImpl,
    })).rejects.toThrow("write_products");
  });

  it("refuses to call Shopify before the action is confirmed and executing", async () => {
    const fetchImpl = vi.fn();

    await expect(executeShopifyProductDraft(action("proposed"), {
      fetchImpl,
      shopDomain: "example-store.myshopify.com",
      accessToken: "test-token",
    })).rejects.toThrow("confirmed executing action");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses productSet with a deterministic handle and forces DRAFT status", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        productSet: {
          product: {
            id: "gid://shopify/Product/123456789",
            title: product.title,
            handle: "captain-q-draft-abcdef1234567890abcd",
            status: "DRAFT",
            variants: { nodes: [{ id: "gid://shopify/ProductVariant/2", price: "8.99" }] },
            media: { nodes: [{ id: "gid://shopify/MediaImage/3" }] },
          },
          userErrors: [],
        },
      },
    }), { status: 200 }));

    const result = await executeShopifyProductDraft(action(), {
      fetchImpl,
      shopDomain: "example-store.myshopify.com",
      accessToken: "test-token",
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`https://example-store.myshopify.com/admin/api/${SHOPIFY_API_VERSION}/graphql.json`);
    const body = JSON.parse(String(init.body));
    expect(body.query).toContain("productSet");
    expect(body.query).not.toContain("publishablePublish");
    expect(body.variables.input).toEqual(expect.objectContaining({
      status: "DRAFT",
      handle: "captain-q-draft-abcdef1234567890abcd",
      variants: [expect.objectContaining({ price: 8.99 })],
    }));
    expect(JSON.stringify(body.variables)).not.toContain("ACTIVE");
    expect(result).toEqual(expect.objectContaining({
      productId: "gid://shopify/Product/123456789",
      status: "DRAFT",
      price: "8.99",
      imageCount: 1,
      adminUrl: "https://example-store.myshopify.com/admin/products/123456789",
    }));
  });

  it("fails closed if Shopify returns any status other than DRAFT", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        productSet: {
          product: {
            id: "gid://shopify/Product/999",
            title: product.title,
            handle: "unsafe",
            status: "ACTIVE",
            variants: { nodes: [] },
            media: { nodes: [] },
          },
          userErrors: [],
        },
      },
    }), { status: 200 }));

    await expect(executeShopifyProductDraft(action(), {
      fetchImpl,
      shopDomain: "example-store.myshopify.com",
      accessToken: "test-token",
    })).rejects.toThrow("Safety check failed");
  });
});
