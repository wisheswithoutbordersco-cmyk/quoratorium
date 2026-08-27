import { z } from "zod";
import {
  createBusinessAction,
  editBusinessAction,
  type BusinessAction,
} from "./businessActions";
import { resolveChatAssetSignedUrls } from "./chatAssets";
import { getStoredShopifyConnection } from "./businessCredentials";

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

async function getShopifyConfig(
  userId?: number,
  overrides?: { shopDomain?: string; accessToken?: string },
) {
  const hasCompleteOverride = Boolean(overrides?.shopDomain && overrides?.accessToken);
  const stored = userId && !hasCompleteOverride
    ? await getStoredShopifyConnection(userId)
    : null;
  const rawDomain = overrides?.shopDomain || stored?.shopDomain || process.env.SHOPIFY_SHOP_DOMAIN || "";
  const accessToken = overrides?.accessToken || stored?.accessToken || process.env.SHOPIFY_ACCESS_TOKEN || "";
  const shopDomain = rawDomain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");

  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shopDomain)) {
    throw new Error("Shopify is not connected: a valid .myshopify.com domain is required");
  }
  if (!accessToken) {
    throw new Error("Shopify is not connected: an Admin API access token is required");
  }
  return { shopDomain, accessToken };
}

export async function getShopifyConnectionStatus(userId: number): Promise<{
  configured: boolean;
  shopDomain: string | null;
  apiVersion: string;
}> {
  try {
    const { shopDomain } = await getShopifyConfig(userId);
    return { configured: true, shopDomain, apiVersion: SHOPIFY_API_VERSION };
  } catch {
    return { configured: false, shopDomain: null, apiVersion: SHOPIFY_API_VERSION };
  }
}

export async function verifyShopifyConnection(input: {
  shopDomain: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<{ shopDomain: string; shopName: string }> {
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
    throw new Error("Shopify could not verify that store domain and token");
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
  };
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
  const product = shopifyDraftInputSchema.parse(input.product);
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
  const product = shopifyDraftInputSchema.parse(input.product);
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

  const response = await fetchImpl(
    `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query, variables }),
    },
  );

  const body = await response.json().catch(() => null) as ShopifyGraphQlResponse | null;
  if (!response.ok) {
    throw new Error(`Shopify request failed (${response.status})`);
  }
  if (body?.errors?.length) {
    throw new Error(`Shopify GraphQL error: ${body.errors.map(error => error.message).join("; ")}`);
  }

  const payload = body?.data?.productSet;
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
