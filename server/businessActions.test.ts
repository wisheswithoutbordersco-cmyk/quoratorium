import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  createVaultEntry: vi.fn(),
  getUserVaultEntriesByType: vi.fn(),
  updateVaultEntry: vi.fn(),
}));

import * as db from "./db";
import {
  BUSINESS_ACTION_ENTRY_TYPE,
  BUSINESS_ACTION_EXECUTION_STALE_MS,
  createBusinessAction,
  editBusinessAction,
  listBusinessActions,
  prepareBusinessActionRetry,
  transitionBusinessAction,
} from "./businessActions";

let rows: any[] = [];
let nextId = 1;

function installDbMock() {
  vi.mocked(db.getUserVaultEntriesByType).mockImplementation(async (userId, entryType) =>
    rows.filter(row => row.user_id === userId && row.entry_type === entryType),
  );
  vi.mocked(db.createVaultEntry).mockImplementation(async input => {
    const now = new Date().toISOString();
    const row = {
      id: nextId++,
      user_id: input.user_id,
      name: input.name,
      entry_type: input.entry_type || "file",
      content: input.content || null,
      file_url: input.file_url || null,
      file_key: input.file_key || null,
      mime_type: input.mime_type || null,
      metadata: input.metadata || null,
      created_at: now,
      updated_at: now,
    };
    rows.push(row);
    return row;
  });
  vi.mocked(db.updateVaultEntry).mockImplementation(async input => {
    const row = rows.find(candidate => candidate.id === input.id && candidate.user_id === input.userId);
    if (!row) throw new Error("not found");
    if (input.name !== undefined) row.name = input.name;
    if (input.content !== undefined) row.content = input.content;
    if (input.metadata !== undefined) row.metadata = input.metadata;
    row.updated_at = new Date().toISOString();
    return row;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  rows = [];
  nextId = 1;
  installDbMock();
});

const productDraft = {
  title: "Printable Birthday Invitation",
  descriptionHtml: "<p>Editable invitation.</p>",
  price: "8.99",
};

async function createProposal(overrides: Record<string, unknown> = {}) {
  return createBusinessAction({
    userId: 7,
    type: "shopify.create_product_draft",
    summary: "Create Shopify draft: Printable Birthday Invitation",
    payload: { ...productDraft, ...overrides },
    preview: { title: productDraft.title, price: productDraft.price },
    conversationId: 42,
  });
}

describe("business action lifecycle", () => {
  it("creates a proposed action without executing it and deduplicates repeated proposals", async () => {
    const first = await createProposal();
    const duplicate = await createProposal();

    expect(first).toEqual(expect.objectContaining({
      id: "1",
      status: "proposed",
      type: "shopify.create_product_draft",
      userId: 7,
      version: 1,
    }));
    expect(duplicate.id).toBe(first.id);
    expect(db.createVaultEntry).toHaveBeenCalledTimes(1);
    expect(rows[0].entry_type).toBe(BUSINESS_ACTION_ENTRY_TYPE);
  });

  it("allows editing only before confirmation and rotates the idempotency key", async () => {
    const proposed = await createProposal();
    const edited = await editBusinessAction({
      userId: 7,
      actionId: proposed.id,
      summary: "Create Shopify draft: Deluxe Birthday Invitation",
      payload: { ...productDraft, title: "Deluxe Birthday Invitation", price: "10.99" },
      preview: { title: "Deluxe Birthday Invitation", price: "10.99" },
    });

    expect(edited.version).toBe(2);
    expect(edited.idempotencyKey).not.toBe(proposed.idempotencyKey);
    await transitionBusinessAction(7, edited.id, ["proposed"], "confirmed");
    await expect(editBusinessAction({
      userId: 7,
      actionId: edited.id,
      summary: "Too late",
      payload: {},
      preview: {},
    })).rejects.toThrow("Only a proposed action can be edited");
  });

  it("makes repeated concurrent confirmation idempotent", async () => {
    const proposed = await createProposal();
    const [first, second] = await Promise.all([
      transitionBusinessAction(7, proposed.id, ["proposed"], "confirmed"),
      transitionBusinessAction(7, proposed.id, ["proposed"], "confirmed"),
    ]);

    expect(first.status).toBe("confirmed");
    expect(second.status).toBe("confirmed");
    expect(db.updateVaultEntry).toHaveBeenCalledTimes(1);
  });

  it("supports cancellation before execution and rejects invalid transitions", async () => {
    const proposed = await createProposal();
    const cancelled = await transitionBusinessAction(7, proposed.id, ["proposed"], "cancelled");

    expect(cancelled.status).toBe("cancelled");
    await expect(
      transitionBusinessAction(7, proposed.id, ["confirmed"], "executing"),
    ).rejects.toThrow("Cannot move business action from cancelled to executing");
  });

  it("prepares a failed draft for retry without changing its Shopify identity", async () => {
    const proposed = await createProposal();
    await transitionBusinessAction(7, proposed.id, ["proposed"], "confirmed");
    await transitionBusinessAction(7, proposed.id, ["confirmed"], "executing");
    const failed = await transitionBusinessAction(7, proposed.id, ["executing"], "failed", {
      error: "Shopify request failed (401)",
    });

    const retried = await prepareBusinessActionRetry(7, failed.id);

    expect(retried.status).toBe("proposed");
    expect(retried.idempotencyKey).toBe(proposed.idempotencyKey);
    expect(retried.error).toBeUndefined();
    expect(retried.result).toBeUndefined();
    expect(retried.confirmedAt).toBeUndefined();
    expect(retried.executedAt).toBeUndefined();
    expect(retried.version).toBe(5);
  });

  it("returns an existing active duplicate instead of reopening a second retry", async () => {
    const original = await createProposal();
    await transitionBusinessAction(7, original.id, ["proposed"], "confirmed");
    await transitionBusinessAction(7, original.id, ["confirmed"], "executing");
    const failed = await transitionBusinessAction(7, original.id, ["executing"], "failed", {
      error: "Interrupted",
    });
    const active = await createProposal();
    const writesBeforeRetry = vi.mocked(db.updateVaultEntry).mock.calls.length;

    const retry = await prepareBusinessActionRetry(7, failed.id);

    expect(retry.id).toBe(active.id);
    expect(retry.status).toBe("proposed");
    expect(db.updateVaultEntry).toHaveBeenCalledTimes(writesBeforeRetry);
  });

  it("marks a stale executing action failed so it can safely reuse the same identity", async () => {
    const proposed = await createProposal();
    await transitionBusinessAction(7, proposed.id, ["proposed"], "confirmed");
    await transitionBusinessAction(7, proposed.id, ["confirmed"], "executing");
    const row = rows.find(candidate => String(candidate.id) === proposed.id);
    row.metadata.updatedAt = new Date(Date.now() - BUSINESS_ACTION_EXECUTION_STALE_MS - 1_000).toISOString();

    const actions = await listBusinessActions(7, { includeTerminal: true });
    const recovered = actions.find(action => action.id === proposed.id);

    expect(recovered?.status).toBe("failed");
    expect(recovered?.error).toContain("interrupted");
    expect(recovered?.idempotencyKey).toBe(proposed.idempotencyKey);
  });

  it("expires stale proposals when they are listed", async () => {
    const proposed = await createBusinessAction({
      userId: 7,
      type: "shopify.create_product_draft",
      summary: "Expired proposal",
      payload: productDraft,
      preview: productDraft,
      expiresInMs: -1,
    });

    const actions = await listBusinessActions(7, { includeTerminal: true });
    expect(actions.find(action => action.id === proposed.id)?.status).toBe("expired");
  });
});
