import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { splitSqlStatements } from "./run_migration.mjs";

describe("Supabase SQL migration parser", () => {
  it("keeps statements that follow comments and preserves dollar-quoted trigger bodies", () => {
    const sql = readFileSync(
      resolve("supabase-action-audit-migration.sql"),
      "utf8"
    );
    const statements = splitSqlStatements(sql);

    expect(
      statements.some(statement =>
        statement.startsWith("ALTER TABLE public.github_connections")
      )
    ).toBe(true);
    expect(
      statements.some(statement =>
        statement.startsWith(
          "CREATE TABLE IF NOT EXISTS public.action_audit_log"
        )
      )
    ).toBe(true);
    expect(
      statements.some(statement =>
        statement.includes(
          "intent_id UUID REFERENCES public.action_audit_log(id) ON DELETE RESTRICT"
        )
      )
    ).toBe(true);
    expect(
      statements.some(statement =>
        statement.includes(
          "CREATE OR REPLACE FUNCTION public.prevent_action_audit_mutation()"
        )
      )
    ).toBe(true);
    expect(
      statements.some(statement =>
        statement.startsWith("CREATE TRIGGER action_audit_log_no_update_delete")
      )
    ).toBe(true);
    expect(
      statements.findIndex(statement =>
        statement.startsWith(
          "CREATE TABLE IF NOT EXISTS public.action_audit_log"
        )
      )
    ).toBeLessThan(
      statements.findIndex(statement =>
        statement.startsWith(
          "CREATE INDEX IF NOT EXISTS idx_action_audit_log_user_created"
        )
      )
    );
  });
});
