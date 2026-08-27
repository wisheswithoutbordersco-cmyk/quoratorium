/**
 * Vault Router — secure file and config storage
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { createVaultEntry, getUserVault, deleteVaultEntry } from "../db";
import { storagePut } from "../storage";

const INTERNAL_ENTRY_TYPES = new Set([
  "business_action",
  "business_connection",
  "conversation_asset",
]);
const INTERNAL_RECORD_KINDS = new Set([
  "business_action",
  "business_connection",
  "conversation_asset",
]);

export const vaultRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const entries = await getUserVault(ctx.user.id);
    return entries.filter(entry =>
      !INTERNAL_ENTRY_TYPES.has(entry.entry_type) &&
      !INTERNAL_RECORD_KINDS.has(String(entry.metadata?.recordKind || "")),
    );
  }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      entryType: z.enum(["file", "credential", "config", "note"]).optional(),
      content: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return createVaultEntry({
        user_id: ctx.user.id,
        name: input.name,
        entry_type: input.entryType || "note",
        content: input.content || null,
        metadata: input.metadata as any || null,
      });
    }),

  uploadFile: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      fileBase64: z.string(),
      mimeType: z.string(),
      filename: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const buffer = Buffer.from(input.fileBase64, "base64");
      const fileKey = `vault/${ctx.user.id}/${input.filename}`;
      const { key, url } = await storagePut(fileKey, buffer, input.mimeType);

      return createVaultEntry({
        user_id: ctx.user.id,
        name: input.name,
        entry_type: "file",
        file_url: url,
        file_key: key,
        mime_type: input.mimeType,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteVaultEntry(input.id, ctx.user.id);
      return { success: true };
    }),
});
