import { createHash } from "crypto";
import * as db from "./db";

export const BUSINESS_ACTION_ENTRY_TYPE = "config";
export const BUSINESS_ACTION_RECORD_KIND = "business_action";
export const BUSINESS_ACTION_TTL_MS = 24 * 60 * 60 * 1000;
export const BUSINESS_ACTION_EXECUTION_STALE_MS = 10 * 60 * 1000;

export type BusinessActionStatus =
  | "proposed"
  | "confirmed"
  | "executing"
  | "completed"
  | "cancelled"
  | "failed"
  | "expired";

export type BusinessActionType = "shopify.create_product_draft";

export interface BusinessAction<TPayload = Record<string, unknown>, TResult = unknown> {
  id: string;
  userId: number;
  type: BusinessActionType;
  status: BusinessActionStatus;
  summary: string;
  payload: TPayload;
  preview: Record<string, unknown>;
  result?: TResult;
  error?: string;
  idempotencyKey: string;
  conversationId?: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  confirmedAt?: string;
  executedAt?: string;
  version: number;
}

interface StoredActionMetadata extends Omit<BusinessAction, "id" | "userId"> {
  schemaVersion: 1;
  recordKind: typeof BUSINESS_ACTION_RECORD_KIND;
}

const transitionLocks = new Map<string, Promise<unknown>>();

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

function createIdempotencyKey(input: {
  userId: number;
  type: BusinessActionType;
  payload: unknown;
  conversationId?: number;
}): string {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(input)))
    .digest("hex");
}

function parseAction(entry: db.VaultEntry): BusinessAction | null {
  if (entry.entry_type !== BUSINESS_ACTION_ENTRY_TYPE) return null;
  const metadata = entry.metadata as Partial<StoredActionMetadata> | null;
  if (!metadata || metadata.schemaVersion !== 1 || metadata.recordKind !== BUSINESS_ACTION_RECORD_KIND) return null;
  if (!metadata.type || !metadata.status || !metadata.idempotencyKey) return null;

  return {
    id: String(entry.id),
    userId: entry.user_id,
    type: metadata.type,
    status: metadata.status,
    summary: metadata.summary || entry.name,
    payload: metadata.payload || {},
    preview: metadata.preview || {},
    result: metadata.result,
    error: metadata.error,
    idempotencyKey: metadata.idempotencyKey,
    conversationId: metadata.conversationId,
    createdAt: metadata.createdAt || entry.created_at,
    updatedAt: metadata.updatedAt || entry.updated_at,
    expiresAt: metadata.expiresAt || entry.created_at,
    confirmedAt: metadata.confirmedAt,
    executedAt: metadata.executedAt,
    version: metadata.version || 1,
  };
}

function toMetadata(action: Omit<BusinessAction, "id" | "userId">): StoredActionMetadata {
  return { schemaVersion: 1, recordKind: BUSINESS_ACTION_RECORD_KIND, ...action };
}

async function withActionLock<T>(actionId: string, operation: () => Promise<T>): Promise<T> {
  const previous = transitionLocks.get(actionId) || Promise.resolve();
  let release: () => void = () => {};
  const current = new Promise<void>(resolve => {
    release = resolve;
  });
  const queued = previous.then(() => current);
  transitionLocks.set(actionId, queued);

  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (transitionLocks.get(actionId) === queued) transitionLocks.delete(actionId);
  }
}

export async function listBusinessActions(
  userId: number,
  options: { conversationId?: number; includeTerminal?: boolean } = {},
): Promise<BusinessAction[]> {
  const entries = await db.getUserVaultEntriesByType(userId, BUSINESS_ACTION_ENTRY_TYPE);
  const now = Date.now();
  const actions = entries.flatMap(entry => {
    const action = parseAction(entry);
    return action ? [action] : [];
  });

  const filtered = actions.filter(action => {
    if (options.conversationId && action.conversationId !== options.conversationId) return false;
    if (!options.includeTerminal && ["completed", "cancelled", "failed", "expired"].includes(action.status)) return false;
    return true;
  });

  return Promise.all(filtered.map(async action => {
    if (action.status === "proposed" && new Date(action.expiresAt).getTime() <= now) {
      return transitionBusinessAction(userId, action.id, ["proposed"], "expired");
    }
    if (
      action.status === "executing" &&
      now - new Date(action.updatedAt).getTime() >= BUSINESS_ACTION_EXECUTION_STALE_MS
    ) {
      return transitionBusinessAction(userId, action.id, ["executing"], "failed", {
        error: "The previous execution was interrupted before Q received a final result. Prepare retry to safely reuse the same Shopify draft identity.",
      });
    }
    return action;
  }));
}

export async function getBusinessAction(
  userId: number,
  actionId: string,
): Promise<BusinessAction | null> {
  const entries = await db.getUserVaultEntriesByType(userId, BUSINESS_ACTION_ENTRY_TYPE);
  const entry = entries.find(candidate => String(candidate.id) === actionId);
  return entry ? parseAction(entry) : null;
}

export async function createBusinessAction(input: {
  userId: number;
  type: BusinessActionType;
  summary: string;
  payload: Record<string, unknown>;
  preview: Record<string, unknown>;
  conversationId?: number;
  expiresInMs?: number;
}): Promise<BusinessAction> {
  const existing = await db.getUserVaultEntriesByType(input.userId, BUSINESS_ACTION_ENTRY_TYPE);
  const idempotencyKey = createIdempotencyKey(input);
  const duplicate = existing
    .map(parseAction)
    .find(action =>
      action?.idempotencyKey === idempotencyKey &&
      !["cancelled", "failed", "expired"].includes(action.status),
    );
  if (duplicate) return duplicate;

  const now = new Date();
  const actionWithoutIds: Omit<BusinessAction, "id" | "userId"> = {
    type: input.type,
    status: "proposed",
    summary: input.summary.trim().slice(0, 500),
    payload: stableValue(input.payload) as Record<string, unknown>,
    preview: stableValue(input.preview) as Record<string, unknown>,
    idempotencyKey,
    conversationId: input.conversationId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + (input.expiresInMs || BUSINESS_ACTION_TTL_MS)).toISOString(),
    version: 1,
  };

  const entry = await db.createVaultEntry({
    user_id: input.userId,
    name: actionWithoutIds.summary,
    entry_type: BUSINESS_ACTION_ENTRY_TYPE,
    content: JSON.stringify(actionWithoutIds.payload),
    metadata: toMetadata(actionWithoutIds),
  });
  const action = parseAction(entry);
  if (!action) throw new Error("Failed to parse stored business action");
  return action;
}

export async function editBusinessAction(input: {
  userId: number;
  actionId: string;
  summary: string;
  payload: Record<string, unknown>;
  preview: Record<string, unknown>;
}): Promise<BusinessAction> {
  return withActionLock(input.actionId, async () => {
    const current = await getBusinessAction(input.userId, input.actionId);
    if (!current) throw new Error("Business action not found");
    if (current.status !== "proposed") {
      throw new Error("Only a proposed action can be edited");
    }

    const now = new Date().toISOString();
    const next: BusinessAction = {
      ...current,
      summary: input.summary.trim().slice(0, 500),
      payload: stableValue(input.payload) as Record<string, unknown>,
      preview: stableValue(input.preview) as Record<string, unknown>,
      idempotencyKey: createIdempotencyKey({
        userId: input.userId,
        type: current.type,
        payload: input.payload,
        conversationId: current.conversationId,
      }),
      updatedAt: now,
      version: current.version + 1,
    };
    const { id: _id, userId: _userId, ...stored } = next;
    const entry = await db.updateVaultEntry({
      id: Number(current.id),
      userId: input.userId,
      name: next.summary,
      content: JSON.stringify(next.payload),
      metadata: toMetadata(stored),
    });
    const action = parseAction(entry);
    if (!action) throw new Error("Failed to parse updated business action");
    return action;
  });
}

export async function prepareBusinessActionRetry(
  userId: number,
  actionId: string,
): Promise<BusinessAction> {
  return withActionLock(actionId, async () => {
    const current = await getBusinessAction(userId, actionId);
    if (!current) throw new Error("Business action not found");
    if (current.type !== "shopify.create_product_draft") {
      throw new Error("Only Shopify product draft actions can be retried");
    }
    if (current.status !== "failed") {
      throw new Error("Only a failed Shopify draft can be prepared for retry");
    }

    const all = (await db.getUserVaultEntriesByType(userId, BUSINESS_ACTION_ENTRY_TYPE))
      .map(parseAction)
      .filter((action): action is BusinessAction => Boolean(action));
    const activeDuplicate = all.find(action =>
      action.id !== current.id &&
      action.idempotencyKey === current.idempotencyKey &&
      !["cancelled", "failed", "expired"].includes(action.status),
    );
    if (activeDuplicate) return activeDuplicate;

    const now = new Date();
    const next: BusinessAction = {
      ...current,
      status: "proposed",
      error: undefined,
      result: undefined,
      confirmedAt: undefined,
      executedAt: undefined,
      updatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + BUSINESS_ACTION_TTL_MS).toISOString(),
      version: current.version + 1,
    };
    const { id: _id, userId: _userId, ...stored } = next;
    const entry = await db.updateVaultEntry({
      id: Number(current.id),
      userId,
      metadata: toMetadata(stored),
    });
    const action = parseAction(entry);
    if (!action) throw new Error("Failed to parse retried business action");
    return action;
  });
}

export async function transitionBusinessAction(
  userId: number,
  actionId: string,
  expected: BusinessActionStatus[],
  status: BusinessActionStatus,
  updates: { result?: unknown; error?: string } = {},
): Promise<BusinessAction> {
  return withActionLock(actionId, async () => {
    const current = await getBusinessAction(userId, actionId);
    if (!current) throw new Error("Business action not found");
    if (!expected.includes(current.status)) {
      if (current.status === status) return current;
      throw new Error(`Cannot move business action from ${current.status} to ${status}`);
    }

    const now = new Date().toISOString();
    const next: BusinessAction = {
      ...current,
      status,
      updatedAt: now,
      version: current.version + 1,
      ...(status === "confirmed" ? { confirmedAt: now } : {}),
      ...(["completed", "failed"].includes(status) ? { executedAt: now } : {}),
      ...(updates.result !== undefined ? { result: updates.result } : {}),
      ...(updates.error ? { error: updates.error.slice(0, 1000) } : {}),
    };
    const { id: _id, userId: _userId, ...stored } = next;
    const entry = await db.updateVaultEntry({
      id: Number(current.id),
      userId,
      metadata: toMetadata(stored),
    });
    const action = parseAction(entry);
    if (!action) throw new Error("Failed to parse transitioned business action");
    return action;
  });
}
