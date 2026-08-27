import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./storage", () => ({
  storagePut: vi.fn(),
  storageGetSignedUrl: vi.fn(),
  storageDelete: vi.fn(),
}));

vi.mock("./db", () => ({
  createVaultEntry: vi.fn(),
  getUserVault: vi.fn(),
  deleteVaultEntry: vi.fn(),
}));

import * as db from "./db";
import { storageDelete, storageGetSignedUrl, storagePut } from "./storage";
import {
  CHAT_ASSET_ENTRY_TYPE,
  CHAT_ASSET_RETENTION,
  deleteConversationAssetReferences,
  persistConversationAttachments,
  rehydrateAttachmentMetadata,
  resolveChatAssetSignedUrls,
} from "./chatAssets";

const dataUrl = `data:image/png;base64,${Buffer.from("durable-image").toString("base64")}`;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("durable conversation assets", () => {
  it("stores image bytes once and persists an owned conversation reference", async () => {
    vi.mocked(storagePut).mockResolvedValue({
      key: "conversation-assets/1/42/photo_abcd1234.png",
      url: "/manus-storage/conversation-assets/1/42/photo_abcd1234.png",
    });
    vi.mocked(db.createVaultEntry).mockResolvedValue({ id: 77 } as any);

    const result = await persistConversationAttachments({
      userId: 1,
      conversationId: 42,
      messageId: 100,
      attachments: [{
        id: "upload-1",
        name: "My Photo.png",
        type: "image/png",
        size: 99,
        dataUrl,
      }],
    });

    expect(storagePut).toHaveBeenCalledWith(
      "conversation-assets/1/42/My-Photo.png",
      Buffer.from("durable-image"),
      "image/png",
    );
    expect(db.createVaultEntry).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 1,
      name: "My Photo.png",
      entry_type: CHAT_ASSET_ENTRY_TYPE,
      file_key: "conversation-assets/1/42/photo_abcd1234.png",
      mime_type: "image/png",
      metadata: expect.objectContaining({
        conversationId: 42,
        messageId: 100,
        retention: CHAT_ASSET_RETENTION,
      }),
    }));
    expect(result).toEqual([
      expect.objectContaining({
        id: "77",
        durable: true,
        storageKey: "conversation-assets/1/42/photo_abcd1234.png",
        retention: CHAT_ASSET_RETENTION,
      }),
    ]);
    expect(result[0]).not.toHaveProperty("dataUrl");
  });

  it("redacts failed uploads independently without aborting the whole message", async () => {
    vi.mocked(storagePut)
      .mockResolvedValueOnce({
        key: "supabase:conversation-assets/1/42/first.png",
        url: "https://storage.example.com/first.png?signature=fresh",
      })
      .mockRejectedValueOnce(new Error("storage unavailable"));
    vi.mocked(db.createVaultEntry).mockResolvedValue({ id: 77 } as any);

    const result = await persistConversationAttachments({
      userId: 1,
      conversationId: 42,
      messageId: 100,
      attachments: [
        {
          id: "upload-1",
          name: "First.png",
          type: "image/png",
          size: 99,
          dataUrl,
        },
        {
          id: "upload-2",
          name: "Second.png",
          type: "image/png",
          size: 99,
          dataUrl,
        },
      ],
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(expect.objectContaining({ durable: true, id: "77" }));
    expect(result[1]).toEqual(expect.objectContaining({
      durable: false,
      id: "upload-2",
      name: "Second.png",
    }));
    expect(result[1]).not.toHaveProperty("dataUrl");
  });

  it("rehydrates a stored reference with a fresh signed HTTPS URL", async () => {
    vi.mocked(storageGetSignedUrl).mockResolvedValue(
      "https://storage.example.com/photo.png?signature=fresh",
    );

    const result = await rehydrateAttachmentMetadata([{
      id: "77",
      name: "My Photo.png",
      type: "image/png",
      size: 13,
      storageKey: "conversation-assets/1/42/photo_abcd1234.png",
      durable: true,
    }]);

    expect(storageGetSignedUrl).toHaveBeenCalledWith(
      "conversation-assets/1/42/photo_abcd1234.png",
    );
    expect(result[0]).toEqual(expect.objectContaining({
      id: "77",
      url: "https://storage.example.com/photo.png?signature=fresh",
      durable: true,
    }));
    expect(result[0]).not.toHaveProperty("storageKey");
  });

  it("signs only requested owner-scoped assets for a confirmed external action", async () => {
    vi.mocked(db.getUserVault).mockResolvedValue([
      { id: 77, entry_type: CHAT_ASSET_ENTRY_TYPE, file_key: "conversation-assets/1/42/photo-a.png" },
      { id: 78, entry_type: CHAT_ASSET_ENTRY_TYPE, file_key: "conversation-assets/1/42/photo-b.png" },
      { id: 79, entry_type: "file", file_key: "vault/private.pdf" },
    ] as any);
    vi.mocked(storageGetSignedUrl).mockResolvedValue(
      "https://storage.example.com/photo-a.png?signature=fresh",
    );

    await expect(resolveChatAssetSignedUrls(1, ["77", "not-owned"])).resolves.toEqual([
      "https://storage.example.com/photo-a.png?signature=fresh",
    ]);
    expect(storageGetSignedUrl).toHaveBeenCalledTimes(1);
    expect(storageGetSignedUrl).toHaveBeenCalledWith("conversation-assets/1/42/photo-a.png");
  });

  it("removes only asset references owned by the deleted conversation", async () => {
    vi.mocked(db.getUserVault).mockResolvedValue([
      {
        id: 1,
        entry_type: CHAT_ASSET_ENTRY_TYPE,
        file_key: "supabase:conversation-assets/8/42/photo.png",
        metadata: { conversationId: 42 },
      },
      { id: 2, entry_type: CHAT_ASSET_ENTRY_TYPE, metadata: { conversationId: 99 } },
      { id: 3, entry_type: "file", metadata: { conversationId: 42 } },
    ] as any);

    vi.mocked(storageDelete).mockResolvedValue(true);

    await expect(deleteConversationAssetReferences(8, 42)).resolves.toBe(1);
    expect(storageDelete).toHaveBeenCalledWith(
      "supabase:conversation-assets/8/42/photo.png",
    );
    expect(db.deleteVaultEntry).toHaveBeenCalledTimes(1);
    expect(db.deleteVaultEntry).toHaveBeenCalledWith(1, 8);
  });
});
