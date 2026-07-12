/**
 * Run the Supabase SQL migration via the Supabase Management API
 * This script reads the SQL file and executes it against the Supabase database.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const sqlFile = readFileSync(join(__dirname, "supabase-main-migration.sql"), "utf-8");

// Split into individual statements and execute
const statements = sqlFile
  .split(/;\s*\n/)
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith("--"));

console.log(`Found ${statements.length} SQL statements to execute...`);

let success = 0;
let failed = 0;

for (let i = 0; i < statements.length; i++) {
  const stmt = statements[i];
  // Skip pure comment blocks
  if (stmt.split("\n").every(line => line.trim().startsWith("--") || line.trim() === "")) continue;
  
  try {
    const { error } = await supabase.rpc("exec_sql", { sql_text: stmt + ";" });
    if (error) {
      // Try direct query via postgrest
      const { error: error2 } = await supabase.from("_exec").select().limit(0);
      console.warn(`  [${i + 1}] Warning: ${error.message.slice(0, 100)}`);
      failed++;
    } else {
      success++;
    }
  } catch (err) {
    console.warn(`  [${i + 1}] Error: ${err.message?.slice(0, 100)}`);
    failed++;
  }
}

console.log(`\nDone: ${success} succeeded, ${failed} had issues.`);
console.log("Note: If statements failed, please run the SQL directly in Supabase SQL Editor.");
