/**
 * Supabase Schema Migration Script
 * Creates the intelligence/memory layer tables with pgvector support.
 * Uses the Supabase SQL query endpoint via the PostgREST /rpc approach.
 * Run with: node server/supabase-migrate.mjs
 */
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: "public" },
});

// All migrations combined into a single SQL block for atomic execution
const fullMigration = `
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

-- Protected Memories table (Patent 1: Two-Tier Memory — Inner Sandbox)
CREATE TABLE IF NOT EXISTS protected_memories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL,
  importance INTEGER DEFAULT 5,
  source_message_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_accessed TIMESTAMPTZ DEFAULT now()
);

-- Disposable Memories table (Patent 1: Two-Tier Memory — Outer Sandbox)
CREATE TABLE IF NOT EXISTS disposable_memories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
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
CREATE INDEX IF NOT EXISTS idx_protected_memories_user ON protected_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_protected_memories_category ON protected_memories(user_id, category);
CREATE INDEX IF NOT EXISTS idx_protected_memories_importance ON protected_memories(user_id, importance DESC);
CREATE INDEX IF NOT EXISTS idx_disposable_memories_user ON disposable_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_disposable_memories_expires ON disposable_memories(expires_at);

-- Enable RLS
ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE protected_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE disposable_memories ENABLE ROW LEVEL SECURITY;

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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'protected_memories_user_policy') THEN
    CREATE POLICY protected_memories_user_policy ON protected_memories
      FOR ALL USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'disposable_memories_user_policy') THEN
    CREATE POLICY disposable_memories_user_policy ON disposable_memories
      FOR ALL USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');
  END IF;
END $$;

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
`;

async function runMigrations() {
  console.log("🚀 Running Supabase schema migrations...\n");

  // Use the Supabase SQL API endpoint directly
  const projectRef = url.replace("https://", "").replace(".supabase.co", "");
  
  // Try using the pg_net or direct SQL approach via PostgREST
  // First, let's try creating an exec_sql function, then use it
  const bootstrapSql = `
    CREATE OR REPLACE FUNCTION exec_sql(sql_query TEXT)
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      EXECUTE sql_query;
    END;
    $$;
  `;

  // Try to create the exec_sql function first via a direct approach
  console.log("  Setting up SQL execution function...");
  
  // Use the Supabase query endpoint
  const { error: bootstrapError } = await supabase.rpc("query", { query_text: bootstrapSql });
  
  if (bootstrapError) {
    // Try alternative: use the /sql endpoint if available
    console.log("  Trying alternative SQL execution method...");
    
    // Split migrations and run them individually via table operations
    // Since we can't run raw SQL directly, we'll verify tables exist via the client
    console.log("  Direct SQL not available via REST API.");
    console.log("  Please run the following SQL in the Supabase Dashboard SQL Editor:\n");
    console.log("  Go to: https://supabase.com/dashboard/project/" + projectRef + "/sql/new\n");
    console.log("─".repeat(60));
    console.log(fullMigration);
    console.log("─".repeat(60));
    console.log("\n  After running the SQL, the tables will be ready.");
    console.log("  Alternatively, checking if tables already exist...\n");
  }

  // Verify tables exist by trying to query them
  const tables = ["agent_memory", "user_memory", "knowledge_base", "protected_memories", "disposable_memories"];
  let allExist = true;

  for (const table of tables) {
    const { error } = await supabase.from(table).select("id").limit(0);
    if (error) {
      console.log(`  ❌ Table '${table}' not found: ${error.message}`);
      allExist = false;
    } else {
      console.log(`  ✓ Table '${table}' exists`);
    }
  }

  if (allExist) {
    console.log("\n✅ All tables exist! Schema is ready.");
    console.log("   - agent_memory, user_memory (existing)");
    console.log("   - knowledge_base (pgvector)");
    console.log("   - protected_memories, disposable_memories (Patent 1: Two-Tier Memory)");
  } else {
    console.log("\n⚠️  Some tables are missing. Please run the SQL migration manually in the Supabase Dashboard.");
    // Write the SQL to a file for easy copy-paste
    const fs = await import("fs");
    fs.writeFileSync("supabase-migration.sql", fullMigration);
    console.log("  SQL saved to: supabase-migration.sql");
  }
}

runMigrations().catch(console.error);
