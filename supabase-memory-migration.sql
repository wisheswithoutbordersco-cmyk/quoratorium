-- Captain Q Memory System
-- Creates tables for semantic memory using pgvector
-- Run this in Supabase SQL Editor or push as a migration

-- Ensure vector extension is enabled (already done via dashboard)
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── Conversation Memory Table ─────────────────────────────
-- Stores embeddings of conversation messages for semantic search
CREATE TABLE IF NOT EXISTS conversation_memory (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  conversation_id INTEGER,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  summary TEXT, -- Short summary for quick retrieval
  embedding vector(1536), -- OpenAI text-embedding-3-small dimension
  metadata JSONB DEFAULT '{}', -- Extra context (intent, tools used, project, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Knowledge Base Table ──────────────────────────────────
-- Stores facts, preferences, and learned information about the user
CREATE TABLE IF NOT EXISTS knowledge_base (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL, -- 'preference', 'fact', 'instruction', 'context'
  key TEXT NOT NULL, -- Short identifier (e.g., "favorite_color", "business_name")
  value TEXT NOT NULL, -- The actual knowledge
  confidence REAL DEFAULT 1.0, -- How confident Q is (0-1)
  embedding vector(1536),
  source TEXT, -- Where this knowledge came from
  last_confirmed TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, category, key)
);

-- ─── Long-term Summary Table ───────────────────────────────
-- Stores compressed summaries of conversation sessions
CREATE TABLE IF NOT EXISTS session_summaries (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  conversation_id INTEGER,
  summary TEXT NOT NULL,
  key_topics TEXT[], -- Array of main topics discussed
  action_items TEXT[], -- Things that need to be done
  decisions_made TEXT[], -- Decisions that were finalized
  embedding vector(1536),
  message_count INTEGER DEFAULT 0,
  session_start TIMESTAMPTZ,
  session_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Indexes for fast retrieval ────────────────────────────

-- Vector similarity search (HNSW index - fastest for approximate nearest neighbor)
CREATE INDEX IF NOT EXISTS idx_conversation_memory_embedding
  ON conversation_memory USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_knowledge_base_embedding
  ON knowledge_base USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_session_summaries_embedding
  ON session_summaries USING hnsw (embedding vector_cosine_ops);

-- Standard indexes for filtering
CREATE INDEX IF NOT EXISTS idx_conversation_memory_user
  ON conversation_memory(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_base_user_category
  ON knowledge_base(user_id, category);

CREATE INDEX IF NOT EXISTS idx_session_summaries_user
  ON session_summaries(user_id, session_end DESC);

-- Trigram index for fuzzy text search
CREATE INDEX IF NOT EXISTS idx_conversation_memory_content_trgm
  ON conversation_memory USING gin (content gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_knowledge_base_value_trgm
  ON knowledge_base USING gin (value gin_trgm_ops);

-- ─── Helper Functions ──────────────────────────────────────

-- Search memory by semantic similarity
CREATE OR REPLACE FUNCTION search_memory(
  query_embedding vector(1536),
  match_user_id INTEGER,
  match_count INTEGER DEFAULT 10,
  similarity_threshold REAL DEFAULT 0.7
)
RETURNS TABLE (
  id BIGINT,
  content TEXT,
  summary TEXT,
  role TEXT,
  similarity REAL,
  created_at TIMESTAMPTZ,
  metadata JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cm.id,
    cm.content,
    cm.summary,
    cm.role,
    (1 - (cm.embedding <=> query_embedding))::REAL AS similarity,
    cm.created_at,
    cm.metadata
  FROM conversation_memory cm
  WHERE cm.user_id = match_user_id
    AND cm.embedding IS NOT NULL
    AND (1 - (cm.embedding <=> query_embedding)) > similarity_threshold
  ORDER BY cm.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Search knowledge base by semantic similarity
CREATE OR REPLACE FUNCTION search_knowledge(
  query_embedding vector(1536),
  match_user_id INTEGER,
  match_count INTEGER DEFAULT 5,
  similarity_threshold REAL DEFAULT 0.7
)
RETURNS TABLE (
  id BIGINT,
  category TEXT,
  key TEXT,
  value TEXT,
  confidence REAL,
  similarity REAL
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id,
    kb.category,
    kb.key,
    kb.value,
    kb.confidence,
    (1 - (kb.embedding <=> query_embedding))::REAL AS similarity
  FROM knowledge_base kb
  WHERE kb.user_id = match_user_id
    AND kb.embedding IS NOT NULL
    AND (1 - (kb.embedding <=> query_embedding)) > similarity_threshold
  ORDER BY kb.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Fuzzy text search (uses pg_trgm)
CREATE OR REPLACE FUNCTION fuzzy_search_memory(
  search_text TEXT,
  match_user_id INTEGER,
  match_count INTEGER DEFAULT 10
)
RETURNS TABLE (
  id BIGINT,
  content TEXT,
  role TEXT,
  similarity REAL,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cm.id,
    cm.content,
    cm.role,
    similarity(cm.content, search_text) AS similarity,
    cm.created_at
  FROM conversation_memory cm
  WHERE cm.user_id = match_user_id
    AND cm.content % search_text
  ORDER BY similarity(cm.content, search_text) DESC
  LIMIT match_count;
END;
$$;

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER conversation_memory_updated_at
  BEFORE UPDATE ON conversation_memory
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER knowledge_base_updated_at
  BEFORE UPDATE ON knowledge_base
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Row Level Security ────────────────────────────────────
-- Enable RLS but allow service role full access

ALTER TABLE conversation_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_summaries ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (this is what your backend uses)
CREATE POLICY "Service role full access" ON conversation_memory
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access" ON knowledge_base
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access" ON session_summaries
  FOR ALL USING (true) WITH CHECK (true);
