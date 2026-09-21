import crypto from "crypto";
import { getSupabaseAdmin } from "./supabase";
import { logger } from "./observability";
import type { GitHubActionId } from "@shared/actionCatalog";

export type ActionAuditOutcome = "allowed" | "blocked" | "succeeded" | "failed";

export interface ActionAuditRecord {
  id?: string;
  intentId?: string;
  actionId: GitHubActionId;
  app: "github";
  userId: number;
  target?: string;
  outcome: ActionAuditOutcome;
  riskLevel: string;
  confirmationRule: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

interface ActionAuditRow {
  id: string | number;
  intent_id: string | null;
  user_id: number;
  app: string;
  action_id: GitHubActionId;
  target: string | null;
  outcome: ActionAuditOutcome;
  risk_level: string;
  confirmation_rule: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

const AUDIT_COLUMNS =
  "id,intent_id,user_id,app,action_id,target,outcome,risk_level,confirmation_rule,details,created_at";
const TERMINAL_RETRY_DELAYS_MS = [0, 50, 150];
const RECONCILIATION_AGE_MS = 5 * 60 * 1000;

function getDb() {
  const db = getSupabaseAdmin();
  if (!db) {
    throw new Error(
      "Audit storage is unavailable; the action was not executed."
    );
  }
  return db;
}

function redactDetails(
  details: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!details) return undefined;
  const blockedKeys = /token|secret|password|authorization|content/i;
  return Object.fromEntries(
    Object.entries(details)
      .filter(([key]) => !blockedKeys.test(key))
      .map(([key, value]) => [
        key,
        typeof value === "string" ? value.slice(0, 500) : value,
      ])
  );
}

function fromRow(row: ActionAuditRow): ActionAuditRecord {
  return {
    id: String(row.id),
    intentId: row.intent_id || undefined,
    actionId: row.action_id,
    app: "github",
    userId: row.user_id,
    target: row.target || undefined,
    outcome: row.outcome,
    riskLevel: row.risk_level,
    confirmationRule: row.confirmation_rule,
    details: row.details || undefined,
    createdAt: row.created_at,
  };
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

/** Persist one immutable audit event. */
export async function recordActionAudit(
  record: Omit<ActionAuditRecord, "app" | "createdAt">
): Promise<ActionAuditRecord> {
  const safeDetails = redactDetails(record.details);
  const db = getDb();
  const eventId = record.id || crypto.randomUUID();
  const { data, error } = await db
    .from("action_audit_log")
    .insert({
      id: eventId,
      intent_id: record.intentId || null,
      user_id: record.userId,
      app: "github",
      action_id: record.actionId,
      target: record.target || null,
      outcome: record.outcome,
      risk_level: record.riskLevel,
      confirmation_rule: record.confirmationRule,
      details: safeDetails || null,
    })
    .select(AUDIT_COLUMNS)
    .single();

  if (error?.code === "23505") {
    const { data: existing, error: lookupError } = await db
      .from("action_audit_log")
      .select(AUDIT_COLUMNS)
      .eq("id", eventId)
      .single();
    if (!lookupError && existing) return fromRow(existing as ActionAuditRow);
  }

  if (error || !data) {
    logger.error("Action Catalog audit persistence failed", {
      service: "action-catalog",
      userId: record.userId,
      metadata: {
        eventId,
        intentId: record.intentId,
        actionId: record.actionId,
        outcome: record.outcome,
        reason: String(error?.message || "no audit row returned").slice(0, 300),
      },
    });
    throw new Error("Audit storage failed; the GitHub action was stopped.");
  }

  return fromRow(data as ActionAuditRow);
}

/**
 * Retry terminal records with a stable event ID. The corresponding intent is
 * already durable, so a later reconciliation pass can repair a prolonged outage.
 */
export async function recordTerminalActionAudit(
  record: Omit<ActionAuditRecord, "app" | "createdAt" | "id"> & {
    intentId: string;
  }
): Promise<ActionAuditRecord> {
  const eventId = crypto.randomUUID();
  let lastError: unknown;
  for (const delay of TERMINAL_RETRY_DELAYS_MS) {
    if (delay) await sleep(delay);
    try {
      return await recordActionAudit({ ...record, id: eventId });
    } catch (error) {
      lastError = error;
    }
  }
  logger.error("GitHub terminal audit requires reconciliation", {
    service: "action-catalog",
    userId: record.userId,
    metadata: {
      eventId,
      intentId: record.intentId,
      actionId: record.actionId,
      outcome: record.outcome,
    },
  });
  throw lastError instanceof Error
    ? lastError
    : new Error("Terminal audit persistence failed.");
}

/** Repair stale intents that have no terminal outcome after an interrupted request. */
export async function reconcileIncompleteActionAudits(
  userId: number
): Promise<number> {
  const db = getDb();
  const cutoff = new Date(Date.now() - RECONCILIATION_AGE_MS).toISOString();
  const { data: intents, error: intentError } = await db
    .from("action_audit_log")
    .select(AUDIT_COLUMNS)
    .eq("user_id", userId)
    .eq("app", "github")
    .eq("outcome", "allowed")
    .lt("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(100);
  if (intentError) {
    throw new Error(
      `Failed to reconcile Action Catalog audit log: ${intentError.message}`
    );
  }

  const intentRows = (intents || []) as ActionAuditRow[];
  if (intentRows.length === 0) return 0;
  const intentIds = intentRows.map(row => String(row.id));
  const { data: terminalRows, error: terminalError } = await db
    .from("action_audit_log")
    .select("intent_id")
    .in("intent_id", intentIds);
  if (terminalError) {
    throw new Error(
      `Failed to reconcile Action Catalog audit log: ${terminalError.message}`
    );
  }
  const completed = new Set(
    (terminalRows || [])
      .map((row: { intent_id?: string | null }) => row.intent_id)
      .filter((value: string | null | undefined): value is string =>
        Boolean(value)
      )
  );

  let repaired = 0;
  for (const intent of intentRows) {
    const intentId = String(intent.id);
    if (completed.has(intentId)) continue;
    await recordTerminalActionAudit({
      intentId,
      actionId: intent.action_id,
      userId,
      target: intent.target || undefined,
      outcome: "failed",
      riskLevel: intent.risk_level,
      confirmationRule: intent.confirmation_rule,
      details: { reason: "request_interrupted_before_terminal_audit" },
    });
    repaired += 1;
  }
  return repaired;
}

export async function listActionAudit(
  userId: number,
  limit = 100
): Promise<ActionAuditRecord[]> {
  await reconcileIncompleteActionAudits(userId);
  const db = getDb();
  const boundedLimit = Math.max(1, Math.min(limit, 250));
  const { data, error } = await db
    .from("action_audit_log")
    .select(AUDIT_COLUMNS)
    .eq("user_id", userId)
    .eq("app", "github")
    .order("created_at", { ascending: false })
    .limit(boundedLimit);

  if (error) {
    throw new Error(
      `Failed to load Action Catalog audit log: ${error.message}`
    );
  }
  return (data || []).map(row => fromRow(row as ActionAuditRow));
}
