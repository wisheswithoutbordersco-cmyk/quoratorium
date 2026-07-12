-- Q Workspace — Full Supabase Schema Migration
-- Creates all tables required by the application

-- Enable pgvector extension (needed for knowledge base)
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── Users ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  clerk_id TEXT NOT NULL UNIQUE,
  name TEXT,
  email TEXT,
  login_method TEXT DEFAULT 'clerk',
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_signed_in TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_clerk_id ON users(clerk_id);

-- ─── Projects ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  project_type TEXT DEFAULT 'other',
  status TEXT DEFAULT 'active',
  current_phase INTEGER DEFAULT 1,
  total_phases INTEGER DEFAULT 16,
  phases JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);

-- ─── Conversations ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);

-- ─── Messages ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);

-- ─── Memory Entries ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memory_entries (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT DEFAULT 'context',
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags JSONB,
  importance INTEGER DEFAULT 5,
  source TEXT DEFAULT 'manual',
  related_project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL,
  use_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_memory_entries_user_id ON memory_entries(user_id);

-- ─── Vault Entries ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vault_entries (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  entry_type TEXT DEFAULT 'file',
  content TEXT,
  file_url TEXT,
  file_key TEXT,
  mime_type TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vault_entries_user_id ON vault_entries(user_id);

-- ─── Generated Files ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS generated_files (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  filepath TEXT NOT NULL,
  content TEXT,
  file_url TEXT,
  file_key TEXT,
  mime_type TEXT,
  language TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_generated_files_project_id ON generated_files(project_id);

-- ─── Orchestration Events ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orchestration_events (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  agent_name TEXT,
  summary TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orchestration_events_user_id ON orchestration_events(user_id);

-- ─── Jobs ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'retrying', 'completed', 'failed', 'dead_letter', 'cancelled')),
  priority TEXT DEFAULT 'normal',
  payload JSONB,
  result JSONB,
  error TEXT,
  progress INTEGER DEFAULT 0,
  retries INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  timeout INTEGER DEFAULT 30000,
  project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL,
  parent_job_id TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

-- ─── API Calls (Cost Tracking) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_calls (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  worker TEXT NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost_usd TEXT DEFAULT '0',
  job_id TEXT,
  project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL,
  duration_ms INTEGER,
  success INTEGER DEFAULT 1,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_api_calls_user_id ON api_calls(user_id);
CREATE INDEX IF NOT EXISTS idx_api_calls_created_at ON api_calls(created_at);

-- ─── Budgets ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS budgets (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  limit_usd TEXT DEFAULT '10.00',
  current_spend TEXT DEFAULT '0',
  reset_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_budgets_user_id ON budgets(user_id);

-- ─── Cost Alerts ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cost_alerts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  threshold TEXT,
  metadata JSONB,
  triggered_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── User Settings ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_settings (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT,
  UNIQUE(user_id, key)
);
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- ─── Shared Projects ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shared_projects (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  title TEXT,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shared_projects_slug ON shared_projects(slug);

-- ─── GitHub Connections ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS github_connections (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_encrypted TEXT NOT NULL,
  username TEXT,
  default_repo TEXT,
  default_branch TEXT,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_github_connections_user_id ON github_connections(user_id);

-- ─── Platform Connections (Vercel, Netlify, Railway) ────────────────────────
CREATE TABLE IF NOT EXISTS platform_connections (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  token_encrypted TEXT NOT NULL,
  username TEXT,
  team_id TEXT,
  metadata JSONB,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_platform_connections_user_id ON platform_connections(user_id);

-- ─── Deployments ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deployments (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  status TEXT DEFAULT 'building',
  url TEXT,
  deployment_id TEXT,
  project_name TEXT,
  branch TEXT,
  commit_message TEXT,
  logs TEXT,
  error TEXT,
  metadata JSONB,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_deployments_project_id ON deployments(project_id);

-- ─── Documents (Knowledge Base / RAG) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime_type TEXT,
  file_size INTEGER DEFAULT 0,
  status TEXT DEFAULT 'indexing',
  storage_key TEXT,
  chunk_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);

-- ─── Chunks (Knowledge Base / RAG) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chunks (
  id BIGSERIAL PRIMARY KEY,
  document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding VECTOR(1536),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_user_id ON chunks(user_id);

-- ─── Knowledge Base (pgvector semantic search) ──────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_base (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding VECTOR(1536),
  metadata JSONB DEFAULT '{}',
  source TEXT DEFAULT 'manual',
  chunk_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_user_id ON knowledge_base(user_id);

-- ─── Subscriptions ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  plan TEXT DEFAULT 'free',
  stripe_subscription_id TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Credit Usage ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS credit_usage (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  credits_used INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- ─── Credit Balances ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS credit_balances (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  bonus_credits INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Credit Transactions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS credit_transactions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);

-- ─── User Memory (Supabase Memory Service) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS user_memory (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  category TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB,
  confidence REAL DEFAULT 0.8,
  source TEXT DEFAULT 'inferred',
  times_reinforced INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, category, key)
);
CREATE INDEX IF NOT EXISTS idx_user_memory_user_id ON user_memory(user_id);

-- ─── Agent Memory ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_memory (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  category TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB,
  confidence REAL DEFAULT 0.8,
  source TEXT DEFAULT 'conversation',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, category, key)
);
CREATE INDEX IF NOT EXISTS idx_agent_memory_user_id ON agent_memory(user_id);

-- ─── Protected Memories (Two-Tier Memory) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS protected_memories (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'project_context',
  importance INTEGER DEFAULT 5,
  source_message_id TEXT,
  last_accessed TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_protected_memories_user_id ON protected_memories(user_id);

-- ─── Disposable Memories (Two-Tier Memory) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS disposable_memories (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_disposable_memories_user_id ON disposable_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_disposable_memories_expires ON disposable_memories(expires_at);

-- ─── Sandboxes ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sandboxes (
  id TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  project_id BIGINT,
  files JSONB DEFAULT '[]',
  deployed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sandboxes_user_id ON sandboxes(user_id);

-- ─── Seed owner user ────────────────────────────────────────────────────────
INSERT INTO users (clerk_id, name, email, role, login_method)
VALUES ('owner_bypass', 'Anthony', 'owner@quoratorium.com', 'admin', 'owner_bypass')
ON CONFLICT (clerk_id) DO NOTHING;
