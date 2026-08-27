import * as db from "./db";
import { storageDelete, storageGetSignedUrl, storagePut } from "./storage";
import type { ChatAttachment } from "./chatAttachments";

export const CHAT_ASSET_ENTRY_TYPE = "file";
export const CHAT_ASSET_RECORD_KIND = "conversation_asset";
export const CHAT_ASSET_RETENTION = "until_conversation_deleted";

export interface DurableChatAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url?: string;
  storageKey?: string;
  durable: boolean;
  retention: typeof CHAT_ASSET_RETENTION;
}

function sanitizeFileName(name: string): string {
  const cleaned = name
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120);
  return cleaned || "attachment";
}

function decodeDataUrl(dataUrl: string): Buffer | null {
  const match = dataUrl.match(/^data:[^;,]+;base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) return null;
  try {
    return Buffer.from(match[1].replace(/\s/g, ""), "base64");
  } catch {
    return null;
  }
}

export async function persistConversationAttachments(input: {
  userId: number;
  conversationId: number;
  messageId: number;
  attachments: ChatAttachment[];
}): Promise<DurableChatAttachment[]> {
  const results: DurableChatAttachment[] = [];

  for (const attachment of input.attachments) {
    if (!attachment.dataUrl) {
      results.push({
        id: attachment.id || crypto.randomUUID(),
        name: attachment.name,
        type: attachment.type,
        size: attachment.size,
        durable: false,
        retention: CHAT_ASSET_RETENTION,
      });
      continue;
    }

    const bytes = decodeDataUrl(attachment.dataUrl);
    if (!bytes || bytes.byteLength === 0) {
      results.push({
        id: attachment.id || crypto.randomUUID(),
        name: attachment.name,
        type: attachment.type,
        size: attachment.size,
        durable: false,
        retention: CHAT_ASSET_RETENTION,
      });
      continue;
    }

    let storedKey: string | null = null;
    try {
      const stored = await storagePut(
        `conversation-assets/${input.userId}/${input.conversationId}/${sanitizeFileName(attachment.name)}`,
        bytes,
        attachment.type,
      );
      storedKey = stored.key;

      const entry = await db.createVaultEntry({
        user_id: input.userId,
        name: attachment.name,
        entry_type: CHAT_ASSET_ENTRY_TYPE,
        file_url: stored.url,
        file_key: stored.key,
        mime_type: attachment.type,
        metadata: {
          recordKind: CHAT_ASSET_RECORD_KIND,
          conversationId: input.conversationId,
          messageId: input.messageId,
          size: bytes.byteLength,
          retention: CHAT_ASSET_RETENTION,
          createdAt: new Date().toISOString(),
        },
      });

      results.push({
        id: String(entry.id),
        name: attachment.name,
        type: attachment.type,
        size: bytes.byteLength,
        url: stored.url,
        storageKey: stored.key,
        durable: true,
        retention: CHAT_ASSET_RETENTION,
      });
    } catch (error) {
      if (storedKey) await storageDelete(storedKey).catch(() => undefined);
      console.warn("[ChatAssets] Failed to persist one attachment", {
        conversationId: input.conversationId,
        messageId: input.messageId,
        name: attachment.name,
        error: error instanceof Error ? error.message : String(error),
      });
      results.push({
        id: attachment.id || crypto.randomUUID(),
        name: attachment.name,
        type: attachment.type,
        size: bytes.byteLength,
        durable: false,
        retention: CHAT_ASSET_RETENTION,
      });
    }
  }

  return results;
}

export async function rehydrateAttachmentMetadata(
  value: unknown,
): Promise<DurableChatAttachment[]> {
  if (!Array.isArray(value)) return [];

  return Promise.all(
    value.slice(0, 10).flatMap(item => {
      if (!item || typeof item !== "object") return [];
      const raw = item as Record<string, unknown>;
      const id = typeof raw.id === "string" ? raw.id : "";
      const name = typeof raw.name === "string" ? raw.name.slice(0, 255) : "attachment";
      const type = typeof raw.type === "string" ? raw.type : "application/octet-stream";
      const size = typeof raw.size === "number" && Number.isFinite(raw.size) ? raw.size : 0;
      const storageKey = typeof raw.storageKey === "string" ? raw.storageKey : undefined;
      const fallbackUrl = typeof raw.url === "string" ? raw.url : undefined;

      return [
        (async (): Promise<DurableChatAttachment> => {
          let url = storageKey ? undefined : fallbackUrl;
          if (storageKey) {
            try {
              url = await storageGetSignedUrl(storageKey);
            } catch (error) {
              console.warn("[ChatAssets] Failed to sign stored attachment", {
                storageKey,
                error,
              });
            }
          }
          return {
            id: id || crypto.randomUUID(),
            name,
            type,
            size,
            url,
            durable: Boolean(storageKey),
            retention: CHAT_ASSET_RETENTION,
          };
        })(),
      ];
    }),
  );
}

export async function resolveChatAssetSignedUrls(
  userId: number,
  assetIds: string[],
): Promise<string[]> {
  if (assetIds.length === 0) return [];
  const allowedIds = new Set(assetIds.slice(0, 10));
  const entries = await db.getUserVault(userId);
  const matching = entries.filter(entry =>
    entry.entry_type === CHAT_ASSET_ENTRY_TYPE &&
    entry.metadata?.recordKind === CHAT_ASSET_RECORD_KIND &&
    allowedIds.has(String(entry.id)) &&
    Boolean(entry.file_key),
  );

  return Promise.all(matching.map(entry => storageGetSignedUrl(entry.file_key!)));
}

export async function deleteConversationAssetReferences(
  userId: number,
  conversationId: number,
): Promise<number> {
  const entries = await db.getUserVault(userId);
  const matching = entries.filter(entry =>
    entry.entry_type === CHAT_ASSET_ENTRY_TYPE &&
    entry.metadata?.recordKind === CHAT_ASSET_RECORD_KIND &&
    Number(entry.metadata?.conversationId) === conversationId,
  );

  await Promise.all(
    matching.map(async entry => {
      if (entry.file_key) {
        try {
          await storageDelete(entry.file_key);
        } catch (error) {
          console.warn("[ChatAssets] Failed to delete stored attachment object", {
            entryId: entry.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      await db.deleteVaultEntry(entry.id, userId);
    }),
  );
  return matching.length;
}
