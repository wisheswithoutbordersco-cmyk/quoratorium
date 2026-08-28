import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetBusinessActionAuthForTests,
  startBusinessActionSession,
} from "../businessActionAuth";
import type { TrpcContext } from "../_core/context";
import type { User } from "../db";

vi.mock("../businessActions", async importOriginal => {
  const actual = await importOriginal<typeof import("../businessActions")>();
  return {
    ...actual,
    getBusinessAction: vi.fn(),
    listBusinessActions: vi.fn(),
    transitionBusinessAction: vi.fn(),
  };
});

vi.mock("../businessCredentials", () => ({
  saveShopifyClientCredentials: vi.fn(),
  saveShopifyConnection: vi.fn(),
  deleteShopifyConnection: vi.fn(),
}));

vi.mock("../shopifyDrafts", async importOriginal => {
  const actual = await importOriginal<typeof import("../shopifyDrafts")>();
  return {
    ...actual,
    getShopifyConnectionStatus: vi.fn(),
    proposeShopifyProductDraft: vi.fn(),
    editShopifyProductDraft: vi.fn(),
    executeShopifyProductDraft: vi.fn(),
    verifyShopifyClientCredentials: vi.fn(),
    verifyShopifyConnection: vi.fn(),
  };
});

import {
  getBusinessAction,
  listBusinessActions,
  transitionBusinessAction,
  type BusinessAction,
} from "../businessActions";
import {
  executeShopifyProductDraft,
  getShopifyConnectionStatus,
  verifyShopifyClientCredentials,
  verifyShopifyConnection,
} from "../shopifyDrafts";
import {
  saveShopifyClientCredentials,
  saveShopifyConnection,
} from "../businessCredentials";
import { businessActionsRouter } from "./businessActions";

const owner: User = {
  id: 1,
  clerk_id: "user_owner",
  name: "Anthony",
  email: "wisheswithoutbordersco@gmail.com",
  login_method: "clerk",
  role: "admin",
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
  last_signed_in: new Date(0).toISOString(),
};

const proposed: BusinessAction = {
  id: "10",
  userId: 1,
  type: "shopify.create_product_draft",
  status: "proposed",
  summary: "Create Shopify draft: Invitation",
  payload: {
    title: "Invitation",
    descriptionHtml: "<p>Printable invitation.</p>",
    price: 8.99,
    tags: [],
    imageUrls: [],
    imageAssetIds: [],
  },
  preview: { status: "DRAFT" },
  idempotencyKey: "abc",
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  version: 1,
};

function actionCookie(): string {
  const res = { cookie: vi.fn(), clearCookie: vi.fn() } as any;
  startBusinessActionSession(res, owner.id);
  const [name, value] = res.cookie.mock.calls[0];
  return `${name}=${encodeURIComponent(value)}`;
}

function caller(options: { cookie?: string; response?: any } = {}) {
  const ctx: TrpcContext = {
    req: {
      headers: { cookie: options.cookie ?? actionCookie() },
      socket: { remoteAddress: "127.0.0.1" },
      ip: "127.0.0.1",
    } as any,
    res: options.response ?? ({ cookie: vi.fn(), clearCookie: vi.fn() } as any),
    user: owner,
    isOwner: true,
    authenticatedUser: null,
    isVerifiedOwner: false,
  };
  return businessActionsRouter.createCaller(ctx);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetBusinessActionAuthForTests();
  process.env.BUSINESS_ACTION_PIN = "correct-horse-47";
  process.env.BUSINESS_ACTION_SESSION_SECRET = "test-session-secret-with-entropy";
  vi.mocked(listBusinessActions).mockResolvedValue([]);
});

describe("business actions router", () => {
  it("reports a locked session and unlocks it without returning the owner code", async () => {
    const response = { cookie: vi.fn(), clearCookie: vi.fn() } as any;
    const lockedCaller = caller({ cookie: "", response });

    await expect(lockedCaller.sessionStatus()).resolves.toMatchObject({
      configured: true,
      unlocked: false,
      ttlMinutes: 30,
    });
    const result = await lockedCaller.unlock({ code: "correct-horse-47" });
    expect(result.unlocked).toBe(true);
    expect(response.cookie).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("correct-horse-47");
  });

  it("verifies and encrypts Shopify client credentials without returning either secret", async () => {
    vi.mocked(verifyShopifyClientCredentials).mockResolvedValue({
      shopDomain: "example-store.myshopify.com",
      shopName: "Example Store",
    });
    vi.mocked(saveShopifyClientCredentials).mockResolvedValue({
      shopDomain: "example-store.myshopify.com",
    });
    const clientId = "shopify_client_id";
    const clientSecret = "shopify_client_secret_value";

    const result = await caller().connectShopify({
      authMode: "client_credentials",
      shopDomain: "example-store.myshopify.com",
      clientId,
      clientSecret,
    });

    expect(verifyShopifyClientCredentials).toHaveBeenCalledWith({
      authMode: "client_credentials",
      shopDomain: "example-store.myshopify.com",
      clientId,
      clientSecret,
    });
    expect(saveShopifyClientCredentials).toHaveBeenCalledWith({
      userId: 1,
      shopDomain: "example-store.myshopify.com",
      clientId,
      clientSecret,
    });
    expect(result).toEqual({
      configured: true,
      authMode: "client_credentials",
      shopDomain: "example-store.myshopify.com",
      shopName: "Example Store",
    });
    expect(JSON.stringify(result)).not.toContain(clientId);
    expect(JSON.stringify(result)).not.toContain(clientSecret);
  });

  it("does not change action state or call Shopify when the store is disconnected", async () => {
    vi.mocked(getShopifyConnectionStatus).mockReturnValue({
      configured: false,
      shopDomain: null,
      apiVersion: "2026-07",
    });

    await expect(caller().confirmShopifyDraft({ actionId: "10" }))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(getBusinessAction).not.toHaveBeenCalled();
    expect(transitionBusinessAction).not.toHaveBeenCalled();
    expect(executeShopifyProductDraft).not.toHaveBeenCalled();
  });

  it("executes only after proposed, confirmed, and executing transitions", async () => {
    vi.mocked(getShopifyConnectionStatus).mockReturnValue({
      configured: true,
      shopDomain: "example-store.myshopify.com",
      apiVersion: "2026-07",
    });
    vi.mocked(getBusinessAction).mockResolvedValue(proposed);
    const confirmed = { ...proposed, status: "confirmed" as const };
    const executing = { ...proposed, status: "executing" as const };
    const completed = { ...proposed, status: "completed" as const, result: { productId: "gid://shopify/Product/1" } };
    vi.mocked(transitionBusinessAction)
      .mockResolvedValueOnce(confirmed)
      .mockResolvedValueOnce(executing)
      .mockResolvedValueOnce(completed);
    vi.mocked(executeShopifyProductDraft).mockResolvedValue({
      productId: "gid://shopify/Product/1",
      title: "Invitation",
      handle: "captain-q-draft-abc",
      status: "DRAFT",
      price: "8.99",
      adminUrl: "https://example-store.myshopify.com/admin/products/1",
      imageCount: 0,
    });

    await expect(caller().confirmShopifyDraft({ actionId: "10" })).resolves.toEqual(completed);
    expect(transitionBusinessAction).toHaveBeenNthCalledWith(
      1, 1, "10", ["proposed"], "confirmed",
    );
    expect(transitionBusinessAction).toHaveBeenNthCalledWith(
      2, 1, "10", ["confirmed"], "executing",
    );
    expect(executeShopifyProductDraft).toHaveBeenCalledWith(executing);
    expect(transitionBusinessAction).toHaveBeenNthCalledWith(
      3,
      1,
      "10",
      ["executing"],
      "completed",
      { result: expect.objectContaining({ status: "DRAFT" }) },
    );
    expect(
      vi.mocked(executeShopifyProductDraft).mock.invocationCallOrder[0],
    ).toBeGreaterThan(
      vi.mocked(transitionBusinessAction).mock.invocationCallOrder[1],
    );
  });
});
