import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { ENV } from "../_core/env";
import {
  getOrCreateCustomer,
  createSubscriptionCheckout,
  createTopUpCheckout,
  createPortalSession,
  PLANS,
  TOP_UPS,
  isStripeConfigured,
  type PlanId,
  type TopUpId,
} from "../services/stripe";
import { getCreditBalance, getSubscription } from "../services/credits";

export const billingRouter = router({
  status: protectedProcedure.query(() => ({
    available: isStripeConfigured() && Boolean(ENV.stripeWebhookSecret),
    checkoutConfigured: isStripeConfigured(),
    webhookConfigured: Boolean(ENV.stripeWebhookSecret),
  })),

  // Get current credit balance and subscription info
  getBalance: protectedProcedure.query(async ({ ctx }) => {
    const balance = await getCreditBalance(ctx.user.id);
    return balance;
  }),

  // Get subscription details
  getSubscription: protectedProcedure.query(async ({ ctx }) => {
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
    .input(
      z.object({
        plan: z.enum(["starter", "pro"]),
        successUrl: z.string().url(),
        cancelUrl: z.string().url(),
      })
    )
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
    .input(
      z.object({
        topUpId: z.enum(["small", "medium", "large"]),
        successUrl: z.string().url(),
        cancelUrl: z.string().url(),
      })
    )
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
    .input(
      z.object({
        returnUrl: z.string().url(),
      })
    )
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
