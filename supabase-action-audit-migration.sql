-- Toríu GitHub read-only connection and Action Catalog audit migration.
-- Apply once to the Quoratorium Supabase project before deploying the feature.

ALTER TABLE public.github_connections
  ADD COLUMN IF NOT EXISTS allowed_repositories JSONB NOT NULL DEFAULT '[]'::jsonb;

DROP INDEX IF EXISTS public.idx_github_connections_user_id;
DELETE FROM public.github_connections AS older
USING public.github_connections AS newer
WHERE older.user_id = newer.user_id
  AND older.id < newer.id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_github_connections_user_id
  ON public.github_connections(user_id);

CREATE TABLE IF NOT EXISTS public.action_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id UUID REFERENCES public.action_audit_log(id) ON DELETE RESTRICT,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  app TEXT NOT NULL CHECK (app IN ('github')),
  action_id TEXT NOT NULL,
  target TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('allowed', 'blocked', 'succeeded', 'failed')),
  risk_level TEXT NOT NULL CHECK (risk_level IN ('none', 'low', 'medium', 'high', 'critical')),
  confirmation_rule TEXT NOT NULL CHECK (confirmation_rule IN ('none', 'review', 'explicit', 'never')),
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.action_audit_log
  ADD COLUMN IF NOT EXISTS intent_id UUID;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'action_audit_log_intent_id_fkey'
      AND conrelid = 'public.action_audit_log'::regclass
  ) THEN
    ALTER TABLE public.action_audit_log
      ADD CONSTRAINT action_audit_log_intent_id_fkey
      FOREIGN KEY (intent_id)
      REFERENCES public.action_audit_log(id)
      ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_action_audit_log_user_created
  ON public.action_audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_action_audit_log_action_created
  ON public.action_audit_log(action_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_action_audit_log_intent
  ON public.action_audit_log(intent_id)
  WHERE intent_id IS NOT NULL;

ALTER TABLE public.action_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.action_audit_log FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.prevent_action_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'action_audit_log is append-only';
END;
$$;

DROP TRIGGER IF EXISTS action_audit_log_no_update_delete ON public.action_audit_log;
CREATE TRIGGER action_audit_log_no_update_delete
BEFORE UPDATE OR DELETE ON public.action_audit_log
FOR EACH ROW EXECUTE FUNCTION public.prevent_action_audit_mutation();
