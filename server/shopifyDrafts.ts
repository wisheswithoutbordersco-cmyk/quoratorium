import { z } from "zod";
import {
  createBusinessAction,
  editBusinessAction,
  getBusinessAction,
  type BusinessAction,
} from "./businessActions";
import {
  listConversationImageAssetIds,
  resolveChatAssetSignedUrls,
} from "./chatAssets";
import {
  getStoredShopifyConnection,
  normalizeShopDomain,
} from "./businessCredentials";

export const SHOPIFY_API_VERSION = "2026-07";

const httpsUrl = z.string().url().refine(value => value.startsWith("https://"), {
  message: "Image URLs must use HTTPS",
});

export const shopifyDraftInputSchema = z.object({
  title: z.string().trim().min(3).max(255),
  descriptionHtml: z.string().trim().max(100_000).default(""),
  price: z.union([z.string(), z.number()]).transform(value => Number(value)).pipe(
    z.number().finite().min(0).max(1_000_000),
  ),
  vendor: z.string().trim().max(255).optional(),
  productType: z.string().trim().max(255).optional(),
  tags: z.array(z.string().trim().min(1).max(255)).max(50).default([]),
  imageUrls: z.array(httpsUrl).max(10).default([]),
  imageAssetIds: z.array(z.string().regex(/^\d+$/)).max(10).default([]),
  seoTitle: z.string().trim().max(70).optional(),
  seoDescription: z.string().trim().max(320).optional(),
});

export type ShopifyDraftInput = z.infer<typeof shopifyDraftInputSchema>;

export interface ShopifyDraftResult {
  productId: string;
  title: string;
  handle: string;
  status: "DRAFT";
  price: string | null;
  adminUrl: string;
  imageCount: number;
}

interface ShopifyClientCredentialsResponse {
  access_token?: string;
  scope?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface CachedShopifyToken {
  accessToken: string;
  expiresAt: number;
  scopes: string[];
}

const shopifyTokenCache = new Map<string, CachedShopifyToken>();
const TOKEN_REFRESH_BUFFER_MS = 60_000;

interface ShopifyGraphQlResponse {
  data?: {
    productSet?: {
      product?: {
        id: string;
        title: string;
        handle: string;
        status: string;
        variants?: { nodes?: Array<{ id: string; price: string }> };
        media?: { nodes?: Array<{ id: string }> };
      } | null;
      userErrors?: Array<{ field?: string[]; message: string; code?: string }>;
    };
  };
  errors?: Array<{ message: string }>;
}

function parseShopifyScopes(value: string | undefined): string[] {
  return String(value || "")
    .split(/[\s,]+/)
    .map(scope => scope.trim())
    .filter(Boolean);
}

export async function exchangeShopifyClientCredentials(input: {
  shopDomain: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
}): Promise<{ shopDomain: string; accessToken: string; expiresAt: number; scopes: string[] }> {
  const shopDomain = normalizeShopDomain(input.shopDomain);
  const clientId = input.clientId.trim();
  const clientSecret = input.clientSecret.trim();
  if (clientId.length < 8 || clientSecret.length < 20) {
    throw new Error("Enter the Shopify client ID and client secret from the Dev Dashboard");
  }

  const response = await (input.fetchImpl || fetch)(
    `https://${shopDomain}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    },
  );
  const body = await response.json().catch(() => null) as ShopifyClientCredentialsResponse | null;
  if (!response.ok || !body?.access_token) {
    throw new Error(body?.error_description || "Shopify could not exchange those client credentials");
  }
  const expiresIn = Number(body.expires_in || 0);
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error("Shopify did not return a valid token expiration");
  }
  const scopes = parseShopifyScopes(body.scope);
  if (!scopes.includes("write_products")) {
    throw new Error("The installed Shopify app version needs the write_products permission");
  }
  return {
    shopDomain,
    accessToken: body.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
    scopes,
  };
}

async function getShopifyConfig(
  userId?: number,
  overrides?: { shopDomain?: string; accessToken?: string; fetchImpl?: typeof fetch },
) {
  if (overrides?.shopDomain && overrides?.accessToken) {
    return {
      shopDomain: normalizeShopDomain(overrides.shopDomain),
      accessToken: overrides.accessToken,
    };
  }

  const stored = userId ? await getStoredShopifyConnection(userId) : null;
  if (stored?.authMode === "access_token") {
    return { shopDomain: stored.shopDomain, accessToken: stored.accessToken };
  }
  if (stored?.authMode === "client_credentials") {
    const cacheKey = `${userId}:${stored.shopDomain}:${stored.clientId}`;
    const cached = shopifyTokenCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt - TOKEN_REFRESH_BUFFER_MS) {
      return { shopDomain: stored.shopDomain, accessToken: cached.accessToken };
    }
    const exchanged = await exchangeShopifyClientCredentials({
      ...stored,
      fetchImpl: overrides?.fetchImpl,
    });
    shopifyTokenCache.set(cacheKey, {
      accessToken: exchanged.accessToken,
      expiresAt: exchanged.expiresAt,
      scopes: exchanged.scopes,
    });
    return { shopDomain: stored.shopDomain, accessToken: exchanged.accessToken };
  }

  const environmentDomain = process.env.SHOPIFY_SHOP_DOMAIN || "";
  const environmentToken = process.env.SHOPIFY_ACCESS_TOKEN || "";
  if (environmentDomain && environmentToken) {
    return {
      shopDomain: normalizeShopDomain(environmentDomain),
      accessToken: environmentToken,
    };
  }
  throw new Error("Shopify is not connected");
}

export function clearShopifyTokenCache(): void {
  shopifyTokenCache.clear();
}

export interface ShopifyConnectionStatus {
  configured: boolean;
  healthy: boolean;
  authMode: "client_credentials" | "access_token" | null;
  shopDomain: string | null;
  shopName: string | null;
  scopes: string[];
  apiVersion: string;
  error: string | null;
}

function safeShopifyError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Shopify connection verification failed";
  return message.replace(/\s+/g, " ").trim().slice(0, 300);
}

export async function getShopifyConnectionStatus(userId: number): Promise<ShopifyConnectionStatus> {
  const stored = await getStoredShopifyConnection(userId);
  const environmentConfigured = Boolean(
    process.env.SHOPIFY_SHOP_DOMAIN && process.env.SHOPIFY_ACCESS_TOKEN,
  );
  if (!stored && !environmentConfigured) {
    return {
      configured: false,
      healthy: false,
      authMode: null,
      shopDomain: null,
      shopName: null,
      scopes: [],
      apiVersion: SHOPIFY_API_VERSION,
      error: null,
    };
  }

  const verifyCurrent = async () => {
    const config = await getShopifyConfig(userId);
    return verifyShopifyConnection(config);
  };

  try {
    const verified = await verifyCurrent();
    return {
      configured: true,
      healthy: true,
      authMode: stored?.authMode || "access_token",
      shopDomain: verified.shopDomain,
      shopName: verified.shopName,
      scopes: verified.scopes,
      apiVersion: SHOPIFY_API_VERSION,
      error: null,
    };
  } catch (firstError) {
    if (stored?.authMode === "client_credentials") {
      clearShopifyTokenCache();
      try {
        const verified = await verifyCurrent();
        return {
          configured: true,
          healthy: true,
          authMode: stored.authMode,
          shopDomain: verified.shopDomain,
          shopName: verified.shopName,
          scopes: verified.scopes,
          apiVersion: SHOPIFY_API_VERSION,
          error: null,
        };
      } catch (refreshedError) {
        return {
          configured: true,
          healthy: false,
          authMode: stored.authMode,
          shopDomain: stored.shopDomain,
          shopName: null,
          scopes: [],
          apiVersion: SHOPIFY_API_VERSION,
          error: safeShopifyError(refreshedError),
        };
      }
    }
    return {
      configured: true,
      healthy: false,
      authMode: stored?.authMode || "access_token",
      shopDomain: stored?.shopDomain || normalizeShopDomain(process.env.SHOPIFY_SHOP_DOMAIN || ""),
      shopName: null,
      scopes: [],
      apiVersion: SHOPIFY_API_VERSION,
      error: safeShopifyError(firstError),
    };
  }
}

export async function verifyShopifyConnection(input: {
  shopDomain: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<{ shopDomain: string; shopName: string; scopes: string[] }> {
  const { shopDomain, accessToken } = await getShopifyConfig(undefined, input);
  const response = await (input.fetchImpl || fetch)(
    `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query: `query CaptainQVerifyShopifyConnection {
          shop { name myshopifyDomain }
          currentAppInstallation { accessScopes { handle } }
        }`,
      }),
    },
  );
  const body = await response.json().catch(() => null) as any;
  if (!response.ok || body?.errors?.length) {
    const rawDetail = typeof body?.error_description === "string"
      ? body.error_description
      : typeof body?.errors === "string"
        ? body.errors
        : Array.isArray(body?.errors)
          ? body.errors.map((error: any) => error?.message).filter(Boolean).join("; ")
          : "";
    const detail = String(rawDetail).replace(/\s+/g, " ").trim().slice(0, 300);
    throw new Error(`Shopify could not verify that store domain and token${detail ? `: ${detail}` : ""}`);
  }
  const scopes = body?.data?.currentAppInstallation?.accessScopes || [];
  if (!scopes.some((scope: any) => scope?.handle === "write_products")) {
    throw new Error("The Shopify token needs the write_products permission");
  }
  const verifiedDomain = String(body?.data?.shop?.myshopifyDomain || "").toLowerCase();
  if (verifiedDomain && verifiedDomain !== shopDomain) {
    throw new Error("The Shopify token belongs to a different store");
  }
  return {
    shopDomain,
    shopName: String(body?.data?.shop?.name || shopDomain),
    scopes: scopes
      .map((scope: any) => String(scope?.handle || ""))
      .filter(Boolean),
  };
}

export async function verifyShopifyClientCredentials(input: {
  shopDomain: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
}): Promise<{ shopDomain: string; shopName: string; scopes: string[] }> {
  const exchanged = await exchangeShopifyClientCredentials(input);
  return verifyShopifyConnection({
    shopDomain: exchanged.shopDomain,
    accessToken: exchanged.accessToken,
    fetchImpl: input.fetchImpl,
  });
}

function draftHandle(idempotencyKey: string): string {
  return `captain-q-draft-${idempotencyKey.slice(0, 20)}`;
}

export function buildShopifyDraftPreview(product: ShopifyDraftInput) {
  return {
    title: product.title,
    price: product.price.toFixed(2),
    vendor: product.vendor || "",
    productType: product.productType || "",
    tags: product.tags,
    imageCount: product.imageUrls.length + product.imageAssetIds.length,
    status: "DRAFT" as const,
    publishesAutomatically: false,
  };
}

export async function proposeShopifyProductDraft(input: {
  userId: number;
  conversationId?: number;
  product: unknown;
}): Promise<BusinessAction<ShopifyDraftInput>> {
  let product = shopifyDraftInputSchema.parse(input.product);
  if (
    product.imageUrls.length === 0 &&
    product.imageAssetIds.length === 0 &&
    input.conversationId
  ) {
    const recoveredImageAssetIds = await listConversationImageAssetIds(
      input.userId,
      input.conversationId,
    );
    if (recoveredImageAssetIds.length > 0) {
      product = { ...product, imageAssetIds: recoveredImageAssetIds };
    }
  }
  const preview = buildShopifyDraftPreview(product);

  return createBusinessAction({
    userId: input.userId,
    type: "shopify.create_product_draft",
    summary: `Create Shopify draft: ${product.title}`,
    payload: product,
    preview,
    conversationId: input.conversationId,
  }) as Promise<BusinessAction<ShopifyDraftInput>>;
}

export async function editShopifyProductDraft(input: {
  userId: number;
  actionId: string;
  product: unknown;
}): Promise<BusinessAction<ShopifyDraftInput>> {
  let product = shopifyDraftInputSchema.parse(input.product);
  const current = await getBusinessAction(input.userId, input.actionId);
  if (!current) throw new Error("Business action not found");

  // Earlier proposal clients could save the conversation image durably while
  // creating a proposal with imageAssetIds: []. During an owner-approved edit,
  // recover only durable images that belong to this action's same conversation.
  if (
    product.imageUrls.length === 0 &&
    product.imageAssetIds.length === 0 &&
    current.conversationId
  ) {
    const recoveredImageAssetIds = await listConversationImageAssetIds(
      input.userId,
      current.conversationId,
    );
    if (recoveredImageAssetIds.length > 0) {
      product = { ...product, imageAssetIds: recoveredImageAssetIds };
    }
  }

  return editBusinessAction({
    userId: input.userId,
    actionId: input.actionId,
    summary: `Create Shopify draft: ${product.title}`,
    payload: product,
    preview: buildShopifyDraftPreview(product),
  }) as Promise<BusinessAction<ShopifyDraftInput>>;
}

export async function executeShopifyProductDraft(
  action: BusinessAction,
  options: {
    fetchImpl?: typeof fetch;
    shopDomain?: string;
    accessToken?: string;
  } = {},
): Promise<ShopifyDraftResult> {
  if (action.type !== "shopify.create_product_draft") {
    throw new Error(`Unsupported Shopify action: ${action.type}`);
  }
  if (action.status !== "executing") {
    throw new Error("Shopify draft execution requires a confirmed executing action");
  }

  const product = shopifyDraftInputSchema.parse(action.payload);
  const { shopDomain, accessToken } = await getShopifyConfig(action.userId, options);
  const handle = draftHandle(action.idempotencyKey);
  const fetchImpl = options.fetchImpl || fetch;
  const durableImageUrls = await resolveChatAssetSignedUrls(
    action.userId,
    product.imageAssetIds,
  );
  const allImageUrls = Array.from(new Set([
    ...product.imageUrls,
    ...durableImageUrls,
  ])).slice(0, 10);

  const query = `
    mutation CaptainQCreateProductDraft(
      $identifier: ProductSetIdentifiers
      $input: ProductSetInput!
      $synchronous: Boolean!
    ) {
      productSet(identifier: $identifier, input: $input, synchronous: $synchronous) {
        product {
          id
          title
          handle
          status
          variants(first: 1) { nodes { id price } }
          media(first: 10) { nodes { id } }
        }
        userErrors { field message code }
      }
    }
  `;

  const variables = {
    identifier: { handle },
    synchronous: true,
    input: {
      title: product.title,
      handle,
      descriptionHtml: product.descriptionHtml,
      status: "DRAFT",
      ...(product.vendor ? { vendor: product.vendor } : {}),
      ...(product.productType ? { productType: product.productType } : {}),
      ...(product.tags.length > 0 ? { tags: product.tags } : {}),
      ...(product.seoTitle || product.seoDescription
        ? {
            seo: {
              ...(product.seoTitle ? { title: product.seoTitle } : {}),
              ...(product.seoDescription ? { description: product.seoDescription } : {}),
            },
          }
        : {}),
      productOptions: [
        { name: "Title", position: 1, values: [{ name: "Default Title" }] },
      ],
      variants: [
        {
          price: Number(product.price.toFixed(2)),
          optionValues: [{ optionName: "Title", name: "Default Title" }],
        },
      ],
      ...(allImageUrls.length > 0
        ? {
            files: allImageUrls.map((url, index) => ({
              originalSource: url,
              alt: `${product.title} image ${index + 1}`,
              filename: `captain-q-product-${index + 1}.jpg`,
              contentType: "IMAGE",
            })),
          }
        : {}),
    },
  };

  const endpoint = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
  const requestDraft = (token: string) => fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
  });

  let response = await requestDraft(accessToken);
  let body = await response.json().catch(() => null) as ShopifyGraphQlResponse | Record<string, unknown> | null;

  // A cached client-credentials token may be revoked or rejected before its
  // advertised expiration. A true 401 is rejected before Shopify runs the
  // mutation, so it is safe to exchange once and retry the exact DRAFT request.
  if (response.status === 401 && !options.accessToken) {
    clearShopifyTokenCache();
    const refreshed = await getShopifyConfig(action.userId, { fetchImpl });
    response = await requestDraft(refreshed.accessToken);
    body = await response.json().catch(() => null) as ShopifyGraphQlResponse | Record<string, unknown> | null;
  }

  if (!response.ok) {
    const rawDetail = body && typeof body === "object"
      ? typeof (body as any).error_description === "string"
        ? (body as any).error_description
        : typeof (body as any).errors === "string"
          ? (body as any).errors
          : Array.isArray((body as any).errors)
            ? (body as any).errors.map((error: any) => error?.message).filter(Boolean).join("; ")
            : ""
      : "";
    const detail = rawDetail.replace(/\s+/g, " ").trim().slice(0, 300);
    throw new Error(`Shopify request failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }
  const graphBody = body as ShopifyGraphQlResponse | null;
  if (graphBody?.errors?.length) {
    throw new Error(`Shopify GraphQL error: ${graphBody.errors.map(error => error.message).join("; ")}`);
  }

  const payload = graphBody?.data?.productSet;
  const userErrors = payload?.userErrors || [];
  if (userErrors.length > 0) {
    throw new Error(`Shopify rejected the draft: ${userErrors.map(error => error.message).join("; ")}`);
  }
  const created = payload?.product;
  if (!created?.id) throw new Error("Shopify did not return the created draft product");
  if (created.status !== "DRAFT") {
    throw new Error(`Safety check failed: Shopify returned product status ${created.status}`);
  }

  const numericId = created.id.split("/").pop() || created.id;
  return {
    productId: created.id,
    title: created.title,
    handle: created.handle,
    status: "DRAFT",
    price: created.variants?.nodes?.[0]?.price || null,
    adminUrl: `https://${shopDomain}/admin/products/${numericId}`,
    imageCount: created.media?.nodes?.length || 0,
  };
}
