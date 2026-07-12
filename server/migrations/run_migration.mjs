/**
 * Run SQL migration against Supabase PostgreSQL
 * Usage: node server/migrations/run_migration.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function runMigration() {
  const sqlPath = join(__dirname, "create_all_tables.sql");
  const sql = readFileSync(sqlPath, "utf-8");

  // Split by semicolons but handle multi-line statements
  const statements = sql
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith("--"));

  console.log(`Running ${statements.length} SQL statements...`);

  let success = 0;
  let errors = 0;

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const preview = stmt.substring(0, 80).replace(/\n/g, " ");

    try {
      const { error } = await supabase.rpc("exec_sql", { sql_text: stmt + ";" });
      if (error) {
        // Try direct query via REST API as fallback
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ sql_text: stmt + ";" }),
        });
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
        }
      }
      success++;
      console.log(`  ✓ [${i + 1}/${statements.length}] ${preview}...`);
    } catch (err) {
      errors++;
      console.error(`  ✗ [${i + 1}/${statements.length}] ${preview}...`);
      console.error(`    Error: ${err.message}`);
    }
  }

  console.log(`\nMigration complete: ${success} succeeded, ${errors} failed`);
}

runMigration().catch(console.error);
