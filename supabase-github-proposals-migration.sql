-- Toríu GitHub proposal -> approved branch -> pull request workflow.
-- All reads and writes go through the authenticated server using service_role.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS github_change_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL,
  repository TEXT NOT NULL,
  base_branch TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  commit_message TEXT NOT NULL,
  files JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'executing', 'pull_request_opened', 'cancelled', 'failed')),
  risk_level TEXT NOT NULL DEFAULT 'high' CHECK (risk_level = 'high'),
  confirmation_rule TEXT NOT NULL DEFAULT 'always_confirm'
    CHECK (confirmation_rule = 'always_confirm'),
  approved_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  pull_request_number INTEGER,
  pull_request_url TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(files) = 'array'),
  CHECK (jsonb_array_length(files) BETWEEN 1 AND 50),
  CHECK (char_length(repository) BETWEEN 3 AND 200),
  CHECK (char_length(base_branch) BETWEEN 1 AND 255),
  CHECK (char_length(branch_name) BETWEEN 7 AND 255),
  CHECK (char_length(title) BETWEEN 1 AND 256),
  CHECK (char_length(commit_message) BETWEEN 1 AND 256)
);

CREATE INDEX IF NOT EXISTS idx_github_change_proposals_user_created
  ON github_change_proposals(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_github_change_proposals_status
  ON github_change_proposals(status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_github_change_proposals_repository_branch
  ON github_change_proposals(repository, branch_name);

ALTER TABLE github_change_proposals ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_github_change_proposals_updated_at
  ON github_change_proposals;
CREATE TRIGGER update_github_change_proposals_updated_at
  BEFORE UPDATE ON github_change_proposals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
