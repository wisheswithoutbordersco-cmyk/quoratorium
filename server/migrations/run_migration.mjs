/**
 * Run an ordered SQL migration against Supabase PostgreSQL.
 *
 * Usage:
 *   node server/migrations/run_migration.mjs
 *   node server/migrations/run_migration.mjs ../../supabase-action-audit-migration.sql
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, isAbsolute, join, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function stripSqlLineComments(sql) {
  return sql
    .split("\n")
    .map(line => {
      let inSingle = false;
      let inDouble = false;
      for (let index = 0; index < line.length - 1; index += 1) {
        const char = line[index];
        const next = line[index + 1];
        if (char === "'" && !inDouble && line[index - 1] !== "\\")
          inSingle = !inSingle;
        if (char === '"' && !inSingle && line[index - 1] !== "\\")
          inDouble = !inDouble;
        if (!inSingle && !inDouble && char === "-" && next === "-")
          return line.slice(0, index);
      }
      return line;
    })
    .join("\n");
}

export function splitSqlStatements(sql) {
  const source = stripSqlLineComments(sql);
  const statements = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let dollarTag = null;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const previous = source[index - 1];

    if (!inSingle && !inDouble && char === "$") {
      const match = source.slice(index).match(/^\$[A-Za-z0-9_]*\$/);
      if (match) {
        const tag = match[0];
        current += tag;
        index += tag.length - 1;
        dollarTag = dollarTag === tag ? null : dollarTag || tag;
        continue;
      }
    }
    if (!dollarTag) {
      if (char === "'" && !inDouble && previous !== "\\") inSingle = !inSingle;
      if (char === '"' && !inSingle && previous !== "\\") inDouble = !inDouble;
    }
    if (char === ";" && !inSingle && !inDouble && !dollarTag) {
      if (current.trim()) statements.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

function migrationPath() {
  const requested = process.argv[2];
  if (!requested) return join(__dirname, "create_all_tables.sql");
  return isAbsolute(requested) ? requested : resolve(process.cwd(), requested);
}

export async function runMigration() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables"
    );
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const sqlPath = migrationPath();
  const statements = splitSqlStatements(readFileSync(sqlPath, "utf-8"));
  console.log(`Running ${statements.length} SQL statements from ${sqlPath}...`);

  for (let index = 0; index < statements.length; index += 1) {
    const statement = statements[index];
    const preview = statement.substring(0, 80).replace(/\n/g, " ");
    const { error } = await supabase.rpc("exec_sql", {
      sql_text: `${statement};`,
    });
    if (error) {
      throw new Error(
        `Migration failed at statement ${index + 1} (${preview}): ${error.message}`
      );
    }
    console.log(`  ✓ [${index + 1}/${statements.length}] ${preview}...`);
  }
  console.log("Migration complete.");
}

const isEntryPoint = process.argv[1] && resolve(process.argv[1]) === __filename;
if (isEntryPoint) {
  runMigration().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
