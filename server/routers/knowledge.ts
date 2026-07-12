/**
 * Knowledge Base tRPC Router
 * Handles document upload, listing, deletion, semantic search, and stats.
 */
import { z } from "zod";
import { protectedProcedure } from "../_core/trpc";
import { router } from "../_core/trpc";
import {
  ingestDocument,
  deleteDocument,
  getUserDocuments,
  getKnowledgeStats,
  semanticSearch,
  extractText,
} from "../ragService";

export const knowledgeRouter = router({
  /**
   * Upload and index a document.
   * Accepts base64-encoded file content.
   */
  upload: protectedProcedure
    .input(
      z.object({
        filename: z.string().min(1).max(512),
        content: z.string(), // base64-encoded file content
        mimeType: z.string().min(1).max(128),
        fileSize: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      // Decode base64 content
      const buffer = Buffer.from(input.content, "base64");
      const textContent = extractText(buffer, input.mimeType);

      if (!textContent || textContent.trim().length < 10) {
        throw new Error("Could not extract meaningful text from the uploaded file.");
      }

      const result = await ingestDocument(
        userId,
        input.filename,
        textContent,
        input.mimeType,
        input.fileSize
      );

      return result;
    }),

  /**
   * List all documents for the current user.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const docs = await getUserDocuments(ctx.user.id);
    return docs;
  }),

  /**
   * Delete a document and all its chunks/embeddings.
   */
  delete: protectedProcedure
    .input(z.object({ documentId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const success = await deleteDocument(ctx.user.id, input.documentId);
      if (!success) {
        throw new Error("Document not found or you don't have permission to delete it.");
      }
      return { success: true };
    }),

  /**
   * Semantic search across the knowledge base.
   */
  search: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1).max(2000),
        topK: z.number().int().min(1).max(20).optional().default(5),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const results = await semanticSearch(ctx.user.id, input.query, input.topK);
      return results;
    }),

  /**
   * Get knowledge base statistics.
   */
  stats: protectedProcedure.query(async ({ ctx }) => {
    return getKnowledgeStats(ctx.user.id);
  }),
});
