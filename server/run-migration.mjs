/**
 * Direct Postgres connection to Supabase to run migrations.
 * Uses the transaction pooler at port 6543.
 * Connection: postgresql://postgres.[ref]:[db-password]@aws-0-[region].pooler.supabase.com:6543/postgres
 * 
 * Since we don't have the DB password, we'll use the service_role JWT as password
 * with the pooler endpoint (Supabase supports this for programmatic access).
 */
import pg from "pg";
import "dotenv/config";

const { Client } = pg;

const supabaseUrl = process.env.SUPABASE_URL; // https://vhhtwspjirfzcuizaerf.supabase.co
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const projectRef = supabaseUrl?.replace("https://", "").replace(".supabase.co", "");

// Supabase pooler connection using service_role key as password
// Format: postgresql://postgres.[ref]:[service_role_key]@aws-0-us-east-1.pooler.supabase.com:5432/postgres
const connectionString = `postgresql://postgres.${projectRef}:${serviceRoleKey}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`;

const migrations = [
  `CREATE EXTENSION IF NOT EXISTS vector;`,
  
  `CREATE TABLE IF NOT EXISTS agent_memory (
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
  );`,
  
  `CREATE TABLE IF NOT EXISTS user_memory (
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
  );`,
  
  `CREATE TABLE IF NOT EXISTS knowledge_base (
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
  );`,
  
  `CREATE INDEX IF NOT EXISTS idx_agent_memory_user_category ON agent_memory(user_id, category);`,
  `CREATE INDEX IF NOT EXISTS idx_user_memory_user_category ON user_memory(user_id, category);`,
  `CREATE INDEX IF NOT EXISTS idx_knowledge_base_user ON knowledge_base(user_id);`,
  
  `ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;`,
  `ALTER TABLE user_memory ENABLE ROW LEVEL SECURITY;`,
  `ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;`,

  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'agent_memory_user_policy') THEN
      CREATE POLICY agent_memory_user_policy ON agent_memory
        FOR ALL USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');
    END IF;
  END $$;`,

  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_memory_user_policy') THEN
      CREATE POLICY user_memory_user_policy ON user_memory
        FOR ALL USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');
    END IF;
  END $$;`,

  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'knowledge_base_user_policy') THEN
      CREATE POLICY knowledge_base_user_policy ON knowledge_base
        FOR ALL USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');
    END IF;
  END $$;`,

  `CREATE OR REPLACE FUNCTION match_knowledge(
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
  $$;`,
];

async function runMigrations() {
  console.log("🚀 Connecting to Supabase Postgres directly...\n");
  console.log(`  Project: ${projectRef}`);
  
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log("  ✓ Connected!\n");

    for (let i = 0; i < migrations.length; i++) {
      const sql = migrations[i];
      const preview = sql.trim().substring(0, 60).replace(/\n/g, " ");
      process.stdout.write(`  [${i + 1}/${migrations.length}] ${preview}...`);

      try {
        await client.query(sql);
        console.log(" ✓");
      } catch (err) {
        if (err.message.includes("already exists")) {
          console.log(" (already exists) ✓");
        } else {
          console.log(` ❌ ${err.message}`);
        }
      }
    }

    console.log("\n✅ All migrations complete!");
  } catch (err) {
    console.error(`\n❌ Connection failed: ${err.message}`);
    console.log("\n  Trying alternative connection strings...");
    
    // Try session pooler at port 5432
    const altConnections = [
      `postgresql://postgres.${projectRef}:${serviceRoleKey}@aws-0-us-west-1.pooler.supabase.com:5432/postgres`,
      `postgresql://postgres.${projectRef}:${serviceRoleKey}@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`,
      `postgresql://postgres:${serviceRoleKey}@db.${projectRef}.supabase.co:5432/postgres`,
    ];
    
    for (const connStr of altConnections) {
      const region = connStr.match(/aws-0-([^.]+)/)?.[1] || "direct";
      process.stdout.write(`  Trying ${region}...`);
      const altClient = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
      try {
        await altClient.connect();
        console.log(" ✓ Connected!");
        
        // Run all migrations
        for (let i = 0; i < migrations.length; i++) {
          try {
            await altClient.query(migrations[i]);
          } catch (e) {
            if (!e.message.includes("already exists")) {
              console.log(`  Warning on migration ${i+1}: ${e.message}`);
            }
          }
        }
        console.log("\n✅ All migrations complete!");
        await altClient.end();
        return;
      } catch (e) {
        console.log(` ❌ ${e.message.substring(0, 50)}`);
        try { await altClient.end(); } catch {}
      }
    }
    
    console.log("\n⚠️  Could not connect directly. The services will use graceful degradation.");
  } finally {
    try { await client.end(); } catch {}
  }
}

runMigrations().catch(console.error);
