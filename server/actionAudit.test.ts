import { beforeEach, describe, expect, it, vi } from "vitest";

const insertSingle = vi.fn();
const insertSelect = vi.fn(() => ({ single: insertSingle }));
const insert = vi.fn(() => ({ select: insertSelect }));
const queryLimit = vi.fn();
const queryIn = vi.fn();
const querySingle = vi.fn();
const query: any = {
  eq: vi.fn(() => query),
  lt: vi.fn(() => query),
  order: vi.fn(() => query),
  limit: queryLimit,
  in: queryIn,
  single: querySingle,
};
const select = vi.fn(() => query);
const from = vi.fn(() => ({ insert, select }));

vi.mock("./supabase", () => ({
  getSupabaseAdmin: vi.fn(() => ({ from })),
}));

vi.mock("./observability", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import {
  reconcileIncompleteActionAudits,
  recordActionAudit,
  recordTerminalActionAudit,
} from "./actionAudit";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Action Catalog audit persistence", () => {
  it("writes a redacted append-only audit row", async () => {
    insertSingle.mockResolvedValue({
      data: {
        id: "audit-1",
        intent_id: null,
        user_id: 7,
        app: "github",
        action_id: "github.repository.file.read",
        target: "example/repo:README.md",
        outcome: "succeeded",
        risk_level: "none",
        confirmation_rule: "none",
        details: { ref: "main" },
        created_at: "2026-09-21T00:00:00Z",
      },
      error: null,
    });

    const result = await recordActionAudit({
      actionId: "github.repository.file.read",
      userId: 7,
      target: "example/repo:README.md",
      outcome: "succeeded",
      riskLevel: "none",
      confirmationRule: "none",
      details: {
        ref: "main",
        token: "must-not-be-stored",
        fileContent: "must-not-be-stored",
      },
    });

    expect(from).toHaveBeenCalledWith("action_audit_log");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 7,
        action_id: "github.repository.file.read",
        details: { ref: "main" },
      })
    );
    expect(result.id).toBe("audit-1");
  });

  it("retries a terminal event with one stable event ID and intent link", async () => {
    insertSingle
      .mockResolvedValueOnce({ data: null, error: { message: "temporary" } })
      .mockResolvedValueOnce({
        data: {
          id: "terminal-1",
          intent_id: "intent-1",
          user_id: 7,
          app: "github",
          action_id: "github.repository.list",
          target: null,
          outcome: "succeeded",
          risk_level: "none",
          confirmation_rule: "none",
          details: null,
          created_at: "2026-09-21T00:00:00Z",
        },
        error: null,
      });

    const result = await recordTerminalActionAudit({
      intentId: "intent-1",
      actionId: "github.repository.list",
      userId: 7,
      outcome: "succeeded",
      riskLevel: "none",
      confirmationRule: "none",
    });

    expect(result.intentId).toBe("intent-1");
    expect(insert).toHaveBeenCalledTimes(2);
    const firstId = insert.mock.calls[0][0].id;
    expect(insert.mock.calls[1][0]).toEqual(
      expect.objectContaining({ id: firstId, intent_id: "intent-1" })
    );
  });

  it("accepts a duplicate retry when the same immutable event already exists", async () => {
    insertSingle.mockResolvedValue({
      data: null,
      error: { code: "23505", message: "duplicate" },
    });
    querySingle.mockResolvedValue({
      data: {
        id: "terminal-fixed-id",
        intent_id: "intent-1",
        user_id: 7,
        app: "github",
        action_id: "github.repository.list",
        target: null,
        outcome: "succeeded",
        risk_level: "none",
        confirmation_rule: "none",
        details: null,
        created_at: "2026-09-21T00:00:00Z",
      },
      error: null,
    });

    const result = await recordActionAudit({
      id: "terminal-fixed-id",
      intentId: "intent-1",
      actionId: "github.repository.list",
      userId: 7,
      outcome: "succeeded",
      riskLevel: "none",
      confirmationRule: "none",
    });

    expect(result.id).toBe("terminal-fixed-id");
  });

  it("reconciles a stale intent without a terminal outcome", async () => {
    queryLimit.mockResolvedValueOnce({
      data: [
        {
          id: "intent-stale",
          intent_id: null,
          user_id: 7,
          app: "github",
          action_id: "github.repository.list",
          target: null,
          outcome: "allowed",
          risk_level: "none",
          confirmation_rule: "none",
          details: null,
          created_at: "2026-09-20T00:00:00Z",
        },
      ],
      error: null,
    });
    queryIn.mockResolvedValueOnce({ data: [], error: null });
    insertSingle.mockResolvedValueOnce({
      data: {
        id: "terminal-reconciled",
        intent_id: "intent-stale",
        user_id: 7,
        app: "github",
        action_id: "github.repository.list",
        target: null,
        outcome: "failed",
        risk_level: "none",
        confirmation_rule: "none",
        details: { reason: "request_interrupted_before_terminal_audit" },
        created_at: "2026-09-21T00:00:00Z",
      },
      error: null,
    });

    await expect(reconcileIncompleteActionAudits(7)).resolves.toBe(1);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        intent_id: "intent-stale",
        outcome: "failed",
      })
    );
  });

  it("fails closed when the audit row cannot be persisted", async () => {
    insertSingle.mockResolvedValue({
      data: null,
      error: { message: "table unavailable" },
    });

    await expect(
      recordActionAudit({
        actionId: "github.repository.list",
        userId: 7,
        outcome: "succeeded",
        riskLevel: "none",
        confirmationRule: "none",
      })
    ).rejects.toThrow("action was stopped");
  });
});
