import { Router, type Request, type Response } from "express";
import Stripe from "stripe";
import { stripe, TOP_UPS } from "../services/stripe";
import { addBonusCredits, updateSubscription } from "../services/credits";
import { getSupabaseAdmin } from "../supabase";
import { ENV } from "../_core/env";

export const stripeWebhookRouter = Router();

// Stripe webhooks need raw body for signature verification
stripeWebhookRouter.post(
  "/",
  async (req: Request, res: Response) => {
    const sig = req.headers["stripe-signature"];

    if (!sig) {
      res.status(400).json({ error: "Missing stripe-signature header" });
      return;
    }

    let event: Stripe.Event;

    try {
      // If webhook secret is configured, verify signature
      if (ENV.stripeWebhookSecret) {
        // Need raw body for verification — express.raw() should be used for this route
        const rawBody = (req as any).rawBody || JSON.stringify(req.body);
        event = stripe.webhooks.constructEvent(rawBody, sig, ENV.stripeWebhookSecret);
      } else {
        // Development mode: trust the payload
        event = req.body as Stripe.Event;
      }
    } catch (err: any) {
      console.error("[Stripe Webhook] Signature verification failed:", err.message);
      res.status(401).json({ error: "Invalid signature" });
      return;
    }

    try {
      switch (event.type) {
        case "checkout.session.completed":
          await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
          break;

        case "customer.subscription.created":
        case "customer.subscription.updated":
          await handleSubscriptionUpdate(event.data.object as Stripe.Subscription);
          break;

        case "customer.subscription.deleted":
          await handleSubscriptionCanceled(event.data.object as Stripe.Subscription);
          break;

        case "invoice.payment_succeeded":
          await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
          break;

        case "invoice.payment_failed":
          await handlePaymentFailed(event.data.object as Stripe.Invoice);
          break;

        default:
          console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (error) {
      console.error(`[Stripe Webhook] Error handling ${event.type}:`, error);
      res.status(500).json({ error: "Webhook handler failed" });
    }
  }
);

// ============================================================================
// EVENT HANDLERS
// ============================================================================

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const customerId = session.customer as string;
  const userId = await getUserIdByCustomerId(customerId);
  if (!userId) {
    console.error("[Stripe] No user found for customer:", customerId);
    return;
  }

  // Handle top-up purchases
  if (session.mode === "payment" && session.metadata?.topup) {
    const topupId = session.metadata.topup as keyof typeof TOP_UPS;
    const credits = TOP_UPS[topupId]?.credits || parseInt(session.metadata.credits || "0");
    if (credits > 0) {
      await addBonusCredits(userId, credits, `topup_${topupId}`);
      console.log(`[Stripe] Added ${credits} bonus credits to user ${userId}`);
    }
  }

  // Subscription checkout is handled by subscription.created event
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const userId = await getUserIdByCustomerId(customerId);
  if (!userId) return;

  // Determine plan from price metadata
  const priceId = subscription.items.data[0]?.price?.id;
  let plan: "free" | "starter" | "pro" = "free";

  if (priceId) {
    const price = await stripe.prices.retrieve(priceId);
    plan = (price.metadata?.plan as "starter" | "pro") || "free";
  }

  const status = subscription.status === "active" || subscription.status === "trialing" ? "active" : subscription.status;

  await updateSubscription(userId, plan, subscription.id, status);

  // Store customer ID in subscription record
  await getSupabaseAdmin()!
    .from("subscriptions")
    .update({ stripe_customer_id: customerId })
    .eq("user_id", userId);

  console.log(`[Stripe] Updated subscription for user ${userId}: plan=${plan}, status=${status}`);
}

async function handleSubscriptionCanceled(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const userId = await getUserIdByCustomerId(customerId);
  if (!userId) return;

  await updateSubscription(userId, "free", null, "canceled");
  console.log(`[Stripe] Subscription canceled for user ${userId}, reverted to free plan`);
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  // Log successful payment
  const customerId = invoice.customer as string;
  const userId = await getUserIdByCustomerId(customerId);
  if (!userId) return;
  console.log(`[Stripe] Payment succeeded for user ${userId}: ${invoice.amount_paid / 100} USD`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  const userId = await getUserIdByCustomerId(customerId);
  if (!userId) return;

  // Update subscription status to past_due
  if ((invoice as any).subscription || invoice.id) {
    await getSupabaseAdmin()!
      .from("subscriptions")
      .update({ status: "past_due", updated_at: new Date().toISOString() })
      .eq("user_id", userId);
  }

  console.log(`[Stripe] Payment failed for user ${userId}`);
}

// ============================================================================
// HELPERS
// ============================================================================

async function getUserIdByCustomerId(customerId: string): Promise<number | null> {
  // First check subscriptions table
  const { data: sub } = await getSupabaseAdmin()!
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .single();

  if (sub) return sub.user_id;

  // Fallback: look up customer metadata in Stripe
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if ((customer as any).deleted) return null;
    const userId = (customer as Stripe.Customer).metadata?.user_id;
    return userId ? parseInt(userId) : null;
  } catch {
    return null;
  }
}
