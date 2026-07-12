import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { OWNER_EMAILS } from "../_core/env";
import {
  getOrCreateCustomer,
  createSubscriptionCheckout,
  createTopUpCheckout,
  createPortalSession,
  PLANS,
  TOP_UPS,
  type PlanId,
  type TopUpId,
} from "../services/stripe";
import {
  getCreditBalance,
  getSubscription,
} from "../services/credits";

/** Synthetic unlimited balance returned for the owner account */
const OWNER_BALANCE = {
  userId: 0,
  plan: "pro" as const,
  dailyCreditsUsed: 0,
  dailyCreditsLimit: 999999,
  dailyCreditsRemaining: 999999,
  bonusCredits: 0,
  totalAvailable: 999999,
  resetAt: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 1)).toISOString(),
};

/** Synthetic unlimited subscription returned for the owner account */
const OWNER_SUBSCRIPTION = {
  plan: "pro" as const,
  status: "active" as const,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
};

export const billingRouter = router({
  // Get current credit balance and subscription info
  getBalance: protectedProcedure.query(async ({ ctx }) => {
    // Owner bypass: return synthetic unlimited balance
    if (ctx.isOwner || (ctx.user.email && OWNER_EMAILS.includes(ctx.user.email.toLowerCase()))) {
      return OWNER_BALANCE;
    }
    const balance = await getCreditBalance(ctx.user.id);
    return balance;
  }),

  // Get subscription details
  getSubscription: protectedProcedure.query(async ({ ctx }) => {
    // Owner bypass: return synthetic unlimited subscription
    if (ctx.isOwner || (ctx.user.email && OWNER_EMAILS.includes(ctx.user.email.toLowerCase()))) {
      return OWNER_SUBSCRIPTION;
    }
    const sub = await getSubscription(ctx.user.id);
    return sub;
  }),

  // Get pricing info (public data — no auth required)
  getPricing: publicProcedure.query(async () => {
    return {
      plans: PLANS,
      topUps: TOP_UPS,
    };
  }),

  // Create Checkout session for subscription upgrade
  createCheckout: protectedProcedure
    .input(z.object({
      plan: z.enum(["starter", "pro"]),
      successUrl: z.string().url(),
      cancelUrl: z.string().url(),
    }))
    .mutation(async ({ ctx, input }) => {
      const customerId = await getOrCreateCustomer(
        ctx.user.id,
        ctx.user.email,
        ctx.user.name
      );

      const url = await createSubscriptionCheckout(
        customerId,
        input.plan,
        input.successUrl,
        input.cancelUrl
      );

      return { url };
    }),

  // Create Checkout session for credit top-up
  createTopUpCheckout: protectedProcedure
    .input(z.object({
      topUpId: z.enum(["small", "medium", "large"]),
      successUrl: z.string().url(),
      cancelUrl: z.string().url(),
    }))
    .mutation(async ({ ctx, input }) => {
      const customerId = await getOrCreateCustomer(
        ctx.user.id,
        ctx.user.email,
        ctx.user.name
      );

      const url = await createTopUpCheckout(
        customerId,
        input.topUpId as TopUpId,
        input.successUrl,
        input.cancelUrl
      );

      return { url };
    }),

  // Create Customer Portal session for managing billing
  createPortalSession: protectedProcedure
    .input(z.object({
      returnUrl: z.string().url(),
    }))
    .mutation(async ({ ctx, input }) => {
      const customerId = await getOrCreateCustomer(
        ctx.user.id,
        ctx.user.email,
        ctx.user.name
      );

      const url = await createPortalSession(customerId, input.returnUrl);
      return { url };
    }),
});
