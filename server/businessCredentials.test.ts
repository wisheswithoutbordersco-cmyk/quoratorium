import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  createVaultEntry: vi.fn(),
  getUserVaultEntriesByType: vi.fn(),
  updateVaultEntry: vi.fn(),
  deleteVaultEntry: vi.fn(),
}));

import * as db from "./db";
import {
  BUSINESS_CONNECTION_ENTRY_TYPE,
  deleteShopifyConnection,
  getStoredShopifyConnection,
  saveShopifyClientCredentials,
  saveShopifyConnection,
} from "./businessCredentials";

let rows: any[] = [];
let nextId = 1;

beforeEach(() => {
  vi.clearAllMocks();
  rows = [];
  nextId = 1;
  process.env.BUSINESS_CREDENTIAL_KEY = "test-only-business-credential-key-material";

  vi.mocked(db.getUserVaultEntriesByType).mockImplementation(async (userId, entryType) =>
    rows.filter(row => row.user_id === userId && row.entry_type === entryType),
  );
  vi.mocked(db.createVaultEntry).mockImplementation(async input => {
    const now = new Date().toISOString();
    const row = {
      id: nextId++,
      user_id: input.user_id,
      name: input.name,
      entry_type: input.entry_type,
      content: input.content || null,
      metadata: input.metadata,
      file_key: null,
      file_url: null,
      mime_type: null,
      created_at: now,
      updated_at: now,
    };
    rows.push(row);
    return row;
  });
  vi.mocked(db.updateVaultEntry).mockImplementation(async input => {
    const row = rows.find(candidate => candidate.id === input.id && candidate.user_id === input.userId);
    if (!row) throw new Error("not found");
    row.name = input.name ?? row.name;
    row.content = input.content ?? null;
    row.metadata = input.metadata ?? row.metadata;
    return row;
  });
  vi.mocked(db.deleteVaultEntry).mockImplementation(async (id, userId) => {
    rows = rows.filter(row => !(row.id === id && row.user_id === userId));
  });
});

afterEach(() => {
  delete process.env.BUSINESS_CREDENTIAL_KEY;
});

describe("encrypted business credentials", () => {
  it("stores authenticated ciphertext without persisting or returning the token", async () => {
    const accessToken = "shpat_test_secret_that_must_not_be_plaintext";
    await expect(saveShopifyConnection({
      userId: 7,
      shopDomain: "https://Example-Store.myshopify.com/",
      accessToken,
    })).resolves.toEqual({ shopDomain: "example-store.myshopify.com" });

    expect(rows).toHaveLength(1);
    expect(rows[0].entry_type).toBe(BUSINESS_CONNECTION_ENTRY_TYPE);
    expect(rows[0].content).toBeNull();
    expect(JSON.stringify(rows[0])).not.toContain(accessToken);
    expect(rows[0].metadata).toEqual(expect.objectContaining({
      schemaVersion: 2,
      provider: "shopify",
      authMode: "access_token",
      shopDomain: "example-store.myshopify.com",
      ciphertext: expect.any(String),
      iv: expect.any(String),
      authTag: expect.any(String),
    }));
  });

  it("decrypts only the connection owned by the requested user", async () => {
    const accessToken = "shpat_owner_specific_secret_token";
    await saveShopifyConnection({
      userId: 7,
      shopDomain: "example-store.myshopify.com",
      accessToken,
    });

    await expect(getStoredShopifyConnection(7)).resolves.toEqual({
      authMode: "access_token",
      shopDomain: "example-store.myshopify.com",
      accessToken,
    });
    await expect(getStoredShopifyConnection(8)).resolves.toBeNull();
  });

  it("encrypts client ID and secret together and decrypts them only for the owner", async () => {
    const clientId = "client_id_for_captain_q";
    const clientSecret = "client_secret_that_must_never_be_plaintext";
    await expect(saveShopifyClientCredentials({
      userId: 7,
      shopDomain: "example-store.myshopify.com",
      clientId,
      clientSecret,
    })).resolves.toEqual({ shopDomain: "example-store.myshopify.com" });

    expect(JSON.stringify(rows[0])).not.toContain(clientId);
    expect(JSON.stringify(rows[0])).not.toContain(clientSecret);
    expect(rows[0].metadata).toEqual(expect.objectContaining({
      schemaVersion: 2,
      authMode: "client_credentials",
      ciphertext: expect.any(String),
      iv: expect.any(String),
      authTag: expect.any(String),
    }));
    await expect(getStoredShopifyConnection(7)).resolves.toEqual({
      authMode: "client_credentials",
      shopDomain: "example-store.myshopify.com",
      clientId,
      clientSecret,
    });
    await expect(getStoredShopifyConnection(8)).resolves.toBeNull();
  });

  it("rotates an existing encrypted token instead of creating duplicate connections", async () => {
    await saveShopifyConnection({
      userId: 7,
      shopDomain: "example-store.myshopify.com",
      accessToken: "shpat_first_secret_token_value",
    });
    await saveShopifyConnection({
      userId: 7,
      shopDomain: "example-store.myshopify.com",
      accessToken: "shpat_second_secret_token_value",
    });

    expect(db.createVaultEntry).toHaveBeenCalledTimes(1);
    expect(db.updateVaultEntry).toHaveBeenCalledTimes(1);
    await expect(getStoredShopifyConnection(7)).resolves.toEqual(expect.objectContaining({
      accessToken: "shpat_second_secret_token_value",
    }));
  });

  it("replaces a direct token with client credentials without creating a duplicate", async () => {
    await saveShopifyConnection({
      userId: 7,
      shopDomain: "example-store.myshopify.com",
      accessToken: "shpat_original_secret_token_value",
    });
    await saveShopifyClientCredentials({
      userId: 7,
      shopDomain: "example-store.myshopify.com",
      clientId: "replacement_client_id",
      clientSecret: "replacement_client_secret_value",
    });

    expect(db.createVaultEntry).toHaveBeenCalledTimes(1);
    expect(db.updateVaultEntry).toHaveBeenCalledTimes(1);
    await expect(getStoredShopifyConnection(7)).resolves.toEqual(expect.objectContaining({
      authMode: "client_credentials",
      clientId: "replacement_client_id",
    }));
  });

  it("removes only the owner-scoped Shopify connection", async () => {
    await saveShopifyConnection({
      userId: 7,
      shopDomain: "example-store.myshopify.com",
      accessToken: "shpat_owner_secret_token_value",
    });

    await expect(deleteShopifyConnection(7)).resolves.toBe(true);
    await expect(getStoredShopifyConnection(7)).resolves.toBeNull();
  });
});
