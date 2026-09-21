-- ============================================================================
-- Quoratorium — Stripe Billing & Credit Tracking Tables
-- Run this in Supabase SQL Editor AFTER the main migration
-- ============================================================================

-- Subscriptions table (one per user)
CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'pro')),
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'incomplete', 'trialing')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub_id ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);

-- Daily credit usage (one row per user per day, auto-resets)
CREATE TABLE IF NOT EXISTS credit_usage (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  credits_used INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_credit_usage_user_date ON credit_usage(user_id, date);

-- Bonus credit balances (from top-ups, never expire)
CREATE TABLE IF NOT EXISTS credit_balances (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  bonus_credits INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_balances_user_id ON credit_balances(user_id);

-- Credit transaction log (audit trail)
CREATE TABLE IF NOT EXISTS credit_transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL, -- positive = added, negative = deducted
  type TEXT NOT NULL CHECK (type IN ('deduction', 'topup', 'subscription_reset', 'refund', 'admin')),
  reason TEXT,
  stripe_payment_intent_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON credit_transactions(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_transactions_stripe_payment_unique
  ON credit_transactions(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- Stripe retries webhook delivery. Claim the payment reference and update the
-- balance in one database transaction so credits can only be granted once.
CREATE OR REPLACE FUNCTION fulfill_credit_topup(
  p_user_id INTEGER,
  p_credits INTEGER,
  p_source TEXT,
  p_payment_reference TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_transaction_id INTEGER;
BEGIN
  IF p_credits <= 0 OR p_payment_reference IS NULL OR length(trim(p_payment_reference)) = 0 THEN
    RAISE EXCEPTION 'Invalid credit top-up parameters';
  END IF;

  INSERT INTO credit_transactions (
    user_id, amount, type, reason, stripe_payment_intent_id, created_at
  ) VALUES (
    p_user_id, p_credits, 'topup', p_source, p_payment_reference, now()
  )
  ON CONFLICT (stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL DO NOTHING
  RETURNING id INTO inserted_transaction_id;

  IF inserted_transaction_id IS NULL THEN
    RETURN FALSE;
  END IF;

  INSERT INTO credit_balances (user_id, bonus_credits, created_at, updated_at)
  VALUES (p_user_id, p_credits, now(), now())
  ON CONFLICT (user_id) DO UPDATE
    SET bonus_credits = credit_balances.bonus_credits + EXCLUDED.bonus_credits,
        updated_at = now();

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION fulfill_credit_topup(INTEGER, INTEGER, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fulfill_credit_topup(INTEGER, INTEGER, TEXT, TEXT) TO service_role;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY subscriptions_user_policy ON subscriptions
  FOR ALL USING (user_id = (SELECT id FROM users WHERE clerk_id = auth.uid()::text));

CREATE POLICY credit_usage_user_policy ON credit_usage
  FOR ALL USING (user_id = (SELECT id FROM users WHERE clerk_id = auth.uid()::text));

CREATE POLICY credit_balances_user_policy ON credit_balances
  FOR ALL USING (user_id = (SELECT id FROM users WHERE clerk_id = auth.uid()::text));

CREATE POLICY credit_transactions_user_policy ON credit_transactions
  FOR ALL USING (user_id = (SELECT id FROM users WHERE clerk_id = auth.uid()::text));

-- Auto-update triggers
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_credit_usage_updated_at BEFORE UPDATE ON credit_usage FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_credit_balances_updated_at BEFORE UPDATE ON credit_balances FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- DONE! Credit tracking tables created.
-- ============================================================================
