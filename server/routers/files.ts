/**
 * Files Router — File upload and management
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { storagePut } from "../storage";

export const filesRouter = router({
  /**
   * Upload a file (base64 encoded) to storage
   * Used by ConversationPanel for file attachments
   */
  upload: protectedProcedure
    .input(z.object({
      filename: z.string().min(1),
      fileBase64: z.string(),
      mimeType: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const buffer = Buffer.from(input.fileBase64, "base64");
      const fileKey = `uploads/${ctx.user.id}/${Date.now()}-${input.filename}`;
      const { key, url } = await storagePut(fileKey, buffer, input.mimeType);

      return {
        key,
        url,
        filename: input.filename,
        mimeType: input.mimeType,
        size: buffer.length,
      };
    }),
});
