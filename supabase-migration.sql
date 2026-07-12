
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Agent Memory table
CREATE TABLE IF NOT EXISTS agent_memory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  category TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  confidence REAL DEFAULT 0.8,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, category, key)
);

-- User Memory table
CREATE TABLE IF NOT EXISTS user_memory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  category TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}',
  confidence REAL DEFAULT 0.8,
  source TEXT DEFAULT 'inferred',
  times_reinforced INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, category, key)
);

-- Knowledge Base table with pgvector
CREATE TABLE IF NOT EXISTS knowledge_base (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}',
  source TEXT,
  chunk_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_memory_user_category ON agent_memory(user_id, category);
CREATE INDEX IF NOT EXISTS idx_user_memory_user_category ON user_memory(user_id, category);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_user ON knowledge_base(user_id);

-- Enable RLS
ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;

-- RLS Policies (service_role bypasses these)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'agent_memory_user_policy') THEN
    CREATE POLICY agent_memory_user_policy ON agent_memory
      FOR ALL USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_memory_user_policy') THEN
    CREATE POLICY user_memory_user_policy ON user_memory
      FOR ALL USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'knowledge_base_user_policy') THEN
    CREATE POLICY knowledge_base_user_policy ON knowledge_base
      FOR ALL USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');
  END IF;
END $$;

-- Helper function to increment reinforcement count
CREATE OR REPLACE FUNCTION increment_reinforcement(
  p_user_id TEXT,
  p_category TEXT,
  p_key TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE user_memory
  SET times_reinforced = times_reinforced + 1,
      confidence = LEAST(confidence + 0.05, 1.0),
      updated_at = NOW()
  WHERE user_id = p_user_id
    AND category = p_category
    AND key = p_key;
END;
$$;

-- Similarity search function
CREATE OR REPLACE FUNCTION match_knowledge(
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5,
  filter_user_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  user_id TEXT,
  title TEXT,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id,
    kb.user_id,
    kb.title,
    kb.content,
    kb.metadata,
    1 - (kb.embedding <=> query_embedding) AS similarity
  FROM knowledge_base kb
  WHERE
    (filter_user_id IS NULL OR kb.user_id = filter_user_id)
    AND 1 - (kb.embedding <=> query_embedding) > match_threshold
  ORDER BY kb.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
