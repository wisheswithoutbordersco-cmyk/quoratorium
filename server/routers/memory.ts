/**
 * Memory Router — persistent context and knowledge base
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { createMemoryEntry, getUserMemory, deleteMemoryEntry } from "../db";
import { updateMemoryEntry, getMemoryStats } from "../memoryService";

const CATEGORY_ENUM = z.enum(["context", "preference", "fact", "instruction", "insight", "correction", "project_summary"]);

export const memoryRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return getUserMemory(ctx.user.id);
  }),

  create: protectedProcedure
    .input(z.object({
      title: z.string().min(1).max(255),
      content: z.string().min(1),
      category: CATEGORY_ENUM.optional(),
      tags: z.array(z.string()).optional(),
      importance: z.number().min(1).max(10).optional(),
      source: z.enum(["manual", "auto_extracted", "correction", "summary"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return createMemoryEntry({
        user_id: ctx.user.id,
        title: input.title,
        content: input.content,
        category: input.category || "context",
        tags: input.tags as any || null,
        importance: input.importance || 5,
        source: input.source || "manual",
      });
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().min(1).max(255).optional(),
      content: z.string().min(1).optional(),
      category: CATEGORY_ENUM.optional(),
      tags: z.array(z.string()).optional(),
      importance: z.number().min(1).max(10).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const updated = await updateMemoryEntry(id, ctx.user.id, data as any);
      if (!updated) throw new Error("Memory entry not found");
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteMemoryEntry(input.id, ctx.user.id);
      return { success: true };
    }),

  stats: protectedProcedure.query(async ({ ctx }) => {
    return getMemoryStats(ctx.user.id);
  }),
});
