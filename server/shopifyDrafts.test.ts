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

vi.mock("./businessCredentials", async importOriginal => {
  const actual = await importOriginal<typeof import("./businessCredentials")>();
  return {
    ...actual,
    getStoredShopifyConnection: vi.fn(),
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
import { getStoredShopifyConnection } from "./businessCredentials";
import {
  clearShopifyTokenCache,
  exchangeShopifyClientCredentials,
  editShopifyProductDraft,
  executeShopifyProductDraft,
  getShopifyConnectionStatus,
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
  clearShopifyTokenCache();
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

  it("reuses the same conversation's durable image for a fresh proposal with no new upload", async () => {
    vi.mocked(listConversationImageAssetIds).mockResolvedValue(["91"]);
    vi.mocked(createBusinessAction).mockImplementation(async input => ({
      ...action("proposed"),
      conversationId: input.conversationId,
      payload: input.payload,
      preview: input.preview,
    }));

    const result = await proposeShopifyProductDraft({
      userId: 1,
      conversationId: 42,
      product: {
        ...product,
        imageUrls: [],
        imageAssetIds: [],
      },
    });

    expect(listConversationImageAssetIds).toHaveBeenCalledWith(1, 42);
    expect(createBusinessAction).toHaveBeenCalledWith(expect.objectContaining({
      userId: 1,
      conversationId: 42,
      payload: expect.objectContaining({ imageAssetIds: ["91"] }),
      preview: expect.objectContaining({ imageCount: 1, status: "DRAFT" }),
    }));
    expect(result.preview).toEqual(expect.objectContaining({ imageCount: 1 }));
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
      scopes: ["read_products", "write_products"],
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
      scopes: ["read_products", "write_products"],
    });
    const body = JSON.parse(String(fetchImpl.mock.calls[0][1].body));
    expect(body.query).toContain("CaptainQVerifyShopifyConnection");
    expect(body.query).not.toContain("mutation");
  });

  it("reports a live healthy connection only after a read-only Admin API verification", async () => {
    vi.mocked(getStoredShopifyConnection).mockResolvedValue({
      authMode: "client_credentials",
      shopDomain: "example-store.myshopify.com",
      clientId: "shopify_client_id",
      clientSecret: "shopify_client_secret_value",
    });
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "healthy_access_token_value",
        scope: "write_products",
        expires_in: 86399,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          shop: { name: "Example Store", myshopifyDomain: "example-store.myshopify.com" },
          currentAppInstallation: { accessScopes: [{ handle: "write_products" }] },
        },
      }), { status: 200 }));

    const status = await getShopifyConnectionStatus(1);

    expect(status).toEqual(expect.objectContaining({
      configured: true,
      healthy: true,
      authMode: "client_credentials",
      shopDomain: "example-store.myshopify.com",
      shopName: "Example Store",
      scopes: ["write_products"],
      error: null,
    }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const verificationBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(verificationBody.query).not.toContain("mutation");
    fetchMock.mockRestore();
  });

  it("fails health closed after one fresh client-token exchange and two rejected read-only checks", async () => {
    vi.mocked(getStoredShopifyConnection).mockResolvedValue({
      authMode: "client_credentials",
      shopDomain: "example-store.myshopify.com",
      clientId: "shopify_client_id",
      clientSecret: "shopify_client_secret_value",
    });
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "first_access_token_value",
        scope: "write_products",
        expires_in: 86399,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ errors: "Invalid token" }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "refreshed_access_token_value",
        scope: "write_products",
        expires_in: 86399,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ errors: "Invalid token" }), { status: 401 }));

    const status = await getShopifyConnectionStatus(1);

    expect(status).toEqual(expect.objectContaining({
      configured: true,
      healthy: false,
      authMode: "client_credentials",
      shopDomain: "example-store.myshopify.com",
      shopName: null,
      scopes: [],
    }));
    expect(status.error).toContain("could not verify");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    for (const index of [1, 3]) {
      const body = JSON.parse(String(fetchMock.mock.calls[index][1]?.body));
      expect(body.query).not.toContain("mutation");
    }
    fetchMock.mockRestore();
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

  it("refreshes client credentials once after a 401 and retries only the forced-DRAFT request", async () => {
    vi.mocked(getStoredShopifyConnection).mockResolvedValue({
      authMode: "client_credentials",
      shopDomain: "example-store.myshopify.com",
      clientId: "shopify_client_id",
      clientSecret: "shopify_client_secret_value",
    });

    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "stale_but_unexpired_access_token",
        scope: "read_products,write_products",
        expires_in: 86399,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        errors: "Invalid API key or access token",
      }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "fresh_access_token_after_401",
        scope: "read_products,write_products",
        expires_in: 86399,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          productSet: {
            product: {
              id: "gid://shopify/Product/222",
              title: product.title,
              handle: "captain-q-draft-abcdef1234567890abcd",
              status: "DRAFT",
              variants: { nodes: [{ id: "gid://shopify/ProductVariant/3", price: "8.99" }] },
              media: { nodes: [{ id: "gid://shopify/MediaImage/4" }] },
            },
            userErrors: [],
          },
        },
      }), { status: 200 }));

    const result = await executeShopifyProductDraft(action());

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[1][1]?.headers).toEqual(expect.objectContaining({
      "X-Shopify-Access-Token": "stale_but_unexpired_access_token",
    }));
    expect(fetchMock.mock.calls[3][1]?.headers).toEqual(expect.objectContaining({
      "X-Shopify-Access-Token": "fresh_access_token_after_401",
    }));
    const firstDraftBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    const retriedDraftBody = JSON.parse(String(fetchMock.mock.calls[3][1]?.body));
    expect(retriedDraftBody).toEqual(firstDraftBody);
    expect(retriedDraftBody.variables.input.status).toBe("DRAFT");
    expect(JSON.stringify(retriedDraftBody.variables)).not.toContain("ACTIVE");
    expect(result).toEqual(expect.objectContaining({ status: "DRAFT", productId: "gid://shopify/Product/222" }));

    fetchMock.mockRestore();
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
