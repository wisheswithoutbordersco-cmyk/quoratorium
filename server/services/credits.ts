import { getSupabaseAdmin } from "../supabase";
import { PLANS, type PlanId } from "./stripe";

// ============================================================================
// CREDIT TRACKING SERVICE
// Daily credits reset at midnight UTC. Top-up credits never expire.
// ============================================================================

export interface CreditBalance {
  userId: number;
  plan: PlanId;
  dailyCreditsUsed: number;
  dailyCreditsLimit: number;
  dailyCreditsRemaining: number;
  bonusCredits: number; // from top-ups, never expire
  totalAvailable: number;
  resetAt: string; // next reset time (midnight UTC)
}

/**
 * Get the user's current credit balance
 */
export async function getCreditBalance(userId: number): Promise<CreditBalance> {
  const today = getUTCDateString();

  // Get user's subscription plan
  const { data: sub } = await getSupabaseAdmin()!
    .from("subscriptions")
    .select("plan, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .single();

  const plan: PlanId = (sub?.plan as PlanId) || "free";
  const dailyLimit = PLANS[plan].dailyCredits;

  // Get today's usage
  const { data: usage } = await getSupabaseAdmin()!
    .from("credit_usage")
    .select("credits_used")
    .eq("user_id", userId)
    .eq("date", today)
    .single();

  const dailyUsed = usage?.credits_used || 0;

  // Get bonus credits (from top-ups)
  const { data: bonus } = await getSupabaseAdmin()!
    .from("credit_balances")
    .select("bonus_credits")
    .eq("user_id", userId)
    .single();

  const bonusCredits = bonus?.bonus_credits || 0;
  const dailyRemaining = Math.max(0, dailyLimit - dailyUsed);

  return {
    userId,
    plan,
    dailyCreditsUsed: dailyUsed,
    dailyCreditsLimit: dailyLimit,
    dailyCreditsRemaining: dailyRemaining,
    bonusCredits,
    totalAvailable: dailyRemaining + bonusCredits,
    resetAt: getNextResetTime(),
  };
}

/**
 * Check if user can afford a credit deduction
 */
export async function canAfford(userId: number, credits: number = 1): Promise<boolean> {
  const balance = await getCreditBalance(userId);
  return balance.totalAvailable >= credits;
}

/**
 * Deduct credits from user's balance.
 * First uses daily credits, then bonus credits.
 * Returns false if insufficient credits.
 */
export async function deductCredits(userId: number, credits: number = 1, reason?: string): Promise<boolean> {
  const balance = await getCreditBalance(userId);

  if (balance.totalAvailable < credits) {
    return false;
  }

  const today = getUTCDateString();
  let remainingToDeduct = credits;

  // First deduct from daily credits
  const dailyDeduction = Math.min(remainingToDeduct, balance.dailyCreditsRemaining);
  if (dailyDeduction > 0) {
    await getSupabaseAdmin()!
      .from("credit_usage")
      .upsert(
        {
          user_id: userId,
          date: today,
          credits_used: balance.dailyCreditsUsed + dailyDeduction,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,date" }
      );
    remainingToDeduct -= dailyDeduction;
  }

  // Then deduct from bonus credits
  if (remainingToDeduct > 0) {
    await getSupabaseAdmin()!
      .from("credit_balances")
      .upsert(
        {
          user_id: userId,
          bonus_credits: Math.max(0, balance.bonusCredits - remainingToDeduct),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
  }

  // Log the transaction
  await getSupabaseAdmin()!.from("credit_transactions").insert({
    user_id: userId,
    amount: -credits,
    type: "deduction",
    reason: reason || "ai_action",
    created_at: new Date().toISOString(),
  });

  return true;
}

/**
 * Add bonus credits from a top-up purchase
 */
export async function addBonusCredits(userId: number, credits: number, source: string): Promise<void> {
  // Get current bonus
  const { data: current } = await getSupabaseAdmin()!
    .from("credit_balances")
    .select("bonus_credits")
    .eq("user_id", userId)
    .single();

  const currentBonus = current?.bonus_credits || 0;

  await getSupabaseAdmin()!
    .from("credit_balances")
    .upsert(
      {
        user_id: userId,
        bonus_credits: currentBonus + credits,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  // Log the transaction
  await getSupabaseAdmin()!.from("credit_transactions").insert({
    user_id: userId,
    amount: credits,
    type: "topup",
    reason: source,
    created_at: new Date().toISOString(),
  });
}

/**
 * Update user's subscription plan
 */
export async function updateSubscription(
  userId: number,
  plan: PlanId,
  stripeSubscriptionId: string | null,
  status: string
): Promise<void> {
  await getSupabaseAdmin()!
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        plan,
        stripe_subscription_id: stripeSubscriptionId,
        status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
}

/**
 * Get user's subscription info
 */
export async function getSubscription(userId: number) {
  const { data } = await getSupabaseAdmin()!
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .single();

  return data;
}

// ============================================================================
// HELPERS
// ============================================================================

function getUTCDateString(): string {
  return new Date().toISOString().split("T")[0];
}

function getNextResetTime(): string {
  const now = new Date();
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return tomorrow.toISOString();
}
