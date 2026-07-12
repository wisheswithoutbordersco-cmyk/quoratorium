import Stripe from "stripe";
import { ENV } from "../_core/env";

if (!ENV.stripeSecretKey) {
  console.warn("[Stripe] STRIPE_SK not configured — billing features disabled");
}

// Use a placeholder key in test/dev environments to avoid Stripe constructor errors
const stripeKey = ENV.stripeSecretKey || "sk_test_placeholder_not_configured";

export const stripe = new Stripe(stripeKey, {
  apiVersion: "2026-04-22.dahlia",
});

// ============================================================================
// PRICING CONFIGURATION
// ============================================================================

export const PLANS = {
  free: {
    name: "Free",
    dailyCredits: 25,
    monthlyCredits: 750,
    price: 0,
    features: ["25 credits/day", "Basic AI models", "3 projects"],
  },
  starter: {
    name: "Starter",
    dailyCredits: 100,
    monthlyCredits: 3000,
    price: 2900, // cents
    features: ["100 credits/day", "All AI models", "Unlimited projects", "Priority support"],
  },
  pro: {
    name: "Pro",
    dailyCredits: 500,
    monthlyCredits: 15000,
    price: 9900, // cents
    features: ["500 credits/day", "Priority AI models", "Unlimited projects", "Priority support", "Custom deployments"],
  },
} as const;

export type PlanId = keyof typeof PLANS;

export const TOP_UPS = {
  small: { credits: 200, price: 900, name: "200 Credits" },
  medium: { credits: 500, price: 1900, name: "500 Credits" },
  large: { credits: 1500, price: 4900, name: "1,500 Credits" },
} as const;

export type TopUpId = keyof typeof TOP_UPS;

// These will be populated after creating products in Stripe
// For now, they'll be created on first use via ensureStripeProducts()
let stripePriceIds: {
  starter_monthly?: string;
  pro_monthly?: string;
  topup_small?: string;
  topup_medium?: string;
  topup_large?: string;
} = {};

/**
 * Ensure Stripe products and prices exist, creating them if needed.
 * Caches price IDs in memory after first call.
 */
export async function ensureStripeProducts(): Promise<typeof stripePriceIds> {
  if (stripePriceIds.starter_monthly) return stripePriceIds;
  if (!ENV.stripeSecretKey) return stripePriceIds;

  try {
    // Search for existing products by metadata
    const products = await stripe.products.list({ limit: 100, active: true });

    const findPrice = async (productId: string, recurring: boolean): Promise<string | undefined> => {
      const prices = await stripe.prices.list({ product: productId, active: true, limit: 10 });
      return prices.data.find(p => recurring ? p.recurring !== null : p.recurring === null)?.id;
    };

    // Check for existing products by name
    const starterProduct = products.data.find(p => p.metadata?.plan === "starter");
    const proProduct = products.data.find(p => p.metadata?.plan === "pro");
    const topupSmallProduct = products.data.find(p => p.metadata?.topup === "small");
    const topupMediumProduct = products.data.find(p => p.metadata?.topup === "medium");
    const topupLargeProduct = products.data.find(p => p.metadata?.topup === "large");

    // Create or find Starter subscription
    if (starterProduct) {
      stripePriceIds.starter_monthly = await findPrice(starterProduct.id, true);
    }
    if (!stripePriceIds.starter_monthly) {
      const product = starterProduct || await stripe.products.create({
        name: "Quoratorium Starter",
        description: "100 credits/day, all AI models, unlimited projects",
        metadata: { plan: "starter" },
      });
      const price = await stripe.prices.create({
        product: typeof product === "string" ? product : product.id,
        unit_amount: PLANS.starter.price,
        currency: "usd",
        recurring: { interval: "month" },
        metadata: { plan: "starter" },
      });
      stripePriceIds.starter_monthly = price.id;
    }

    // Create or find Pro subscription
    if (proProduct) {
      stripePriceIds.pro_monthly = await findPrice(proProduct.id, true);
    }
    if (!stripePriceIds.pro_monthly) {
      const product = proProduct || await stripe.products.create({
        name: "Quoratorium Pro",
        description: "500 credits/day, priority AI models, unlimited everything",
        metadata: { plan: "pro" },
      });
      const price = await stripe.prices.create({
        product: typeof product === "string" ? product : product.id,
        unit_amount: PLANS.pro.price,
        currency: "usd",
        recurring: { interval: "month" },
        metadata: { plan: "pro" },
      });
      stripePriceIds.pro_monthly = price.id;
    }

    // Create or find top-up products
    const topupConfigs = [
      { key: "topup_small" as const, meta: "small", name: "200 Credit Top-Up", amount: TOP_UPS.small.price, credits: 200 },
      { key: "topup_medium" as const, meta: "medium", name: "500 Credit Top-Up", amount: TOP_UPS.medium.price, credits: 500 },
      { key: "topup_large" as const, meta: "large", name: "1,500 Credit Top-Up", amount: TOP_UPS.large.price, credits: 1500 },
    ];

    for (const cfg of topupConfigs) {
      const existing = [topupSmallProduct, topupMediumProduct, topupLargeProduct].find(
        p => p?.metadata?.topup === cfg.meta
      );
      if (existing) {
        stripePriceIds[cfg.key] = await findPrice(existing.id, false);
      }
      if (!stripePriceIds[cfg.key]) {
        const product = existing || await stripe.products.create({
          name: cfg.name,
          description: `${cfg.credits} bonus credits for Quoratorium`,
          metadata: { topup: cfg.meta, credits: String(cfg.credits) },
        });
        const price = await stripe.prices.create({
          product: typeof product === "string" ? product : product.id,
          unit_amount: cfg.amount,
          currency: "usd",
          metadata: { topup: cfg.meta, credits: String(cfg.credits) },
        });
        stripePriceIds[cfg.key] = price.id;
      }
    }

    console.log("[Stripe] Products and prices ready:", stripePriceIds);
    return stripePriceIds;
  } catch (error) {
    console.error("[Stripe] Failed to ensure products:", error);
    return stripePriceIds;
  }
}

/**
 * Get or create a Stripe customer for a user
 */
export async function getOrCreateCustomer(userId: number, email: string | null, name: string | null): Promise<string> {
  // Search for existing customer by metadata
  const existing = await stripe.customers.search({
    query: `metadata["user_id"]:"${userId}"`,
  });

  if (existing.data.length > 0) {
    return existing.data[0].id;
  }

  // Create new customer
  const customer = await stripe.customers.create({
    email: email || undefined,
    name: name || undefined,
    metadata: { user_id: String(userId) },
  });

  return customer.id;
}

/**
 * Create a Checkout Session for subscription
 */
export async function createSubscriptionCheckout(
  customerId: string,
  plan: "starter" | "pro",
  successUrl: string,
  cancelUrl: string
): Promise<string> {
  const prices = await ensureStripeProducts();
  const priceId = plan === "starter" ? prices.starter_monthly : prices.pro_monthly;

  if (!priceId) throw new Error(`Price not found for plan: ${plan}`);

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { plan },
  });

  return session.url!;
}

/**
 * Create a Checkout Session for credit top-up
 */
export async function createTopUpCheckout(
  customerId: string,
  topUpId: TopUpId,
  successUrl: string,
  cancelUrl: string
): Promise<string> {
  const prices = await ensureStripeProducts();
  const priceId = prices[`topup_${topUpId}`];

  if (!priceId) throw new Error(`Price not found for top-up: ${topUpId}`);

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "payment",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { topup: topUpId, credits: String(TOP_UPS[topUpId].credits) },
  });

  return session.url!;
}

/**
 * Create a Customer Portal session for managing subscriptions
 */
export async function createPortalSession(customerId: string, returnUrl: string): Promise<string> {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return session.url;
}
