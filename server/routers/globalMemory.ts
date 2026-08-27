/**
 * Global Memory tRPC Router
 * Provides frontend access to Supabase-backed persistent memory:
 * - User preferences (cross-project, cross-session)
 * - Agent memory (what Captain Q learns over time)
 * - Knowledge base (pgvector RAG)
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  getAllUserMemory,
  getUserMemoryByCategory,
  setUserMemory,
  deleteUserMemory,
  clearAllUserMemory,
  getAgentMemory,
  setAgentMemory,
  deleteAgentMemory,
  clearAllAgentMemory,
  MEMORY_CATEGORIES,
} from "../supabaseMemoryService";
import {
  addKnowledgeEntry,
  searchKnowledge,
  getUserKnowledge,
  deleteKnowledgeEntry,
  clearUserKnowledge,
} from "../knowledgeBaseService";
import { isSupabaseConfigured } from "../supabase";

export const globalMemoryRouter = router({
  /**
   * Get Supabase connection status
   */
  status: protectedProcedure.query(async () => {
    return {
      configured: isSupabaseConfigured(),
      categories: MEMORY_CATEGORIES,
    };
  }),

  // ─── User Memory ────────────────────────────────────────────────────────

  /**
   * Get all user memories across all categories
   */
  getUserMemories: protectedProcedure.query(async ({ ctx }) => {
    const userId = String(ctx.user.id);
    return getAllUserMemory(userId);
  }),

  /**
   * Get user memories by category
   */
  getUserMemoryByCategory: protectedProcedure
    .input(z.object({ category: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = String(ctx.user.id);
      return getUserMemoryByCategory(userId, input.category);
    }),

  /**
   * Set a user memory entry
   */
  setUserMemory: protectedProcedure
    .input(z.object({
      category: z.string(),
      key: z.string().min(1).max(200),
      value: z.any(),
      source: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = String(ctx.user.id);
      const success = await setUserMemory(userId, input.category, input.key, input.value, input.source);
      return { success };
    }),

  /**
   * Delete a specific user memory
   */
  deleteUserMemory: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = String(ctx.user.id);
      const success = await deleteUserMemory(userId, input.id);
      return { success };
    }),

  /**
   * Clear all user memories
   */
  clearUserMemories: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = String(ctx.user.id);
    const success = await clearAllUserMemory(userId);
    return { success };
  }),

  // ─── Agent Memory ───────────────────────────────────────────────────────

  /**
   * Get all agent memories
   */
  getAgentMemories: protectedProcedure
    .input(z.object({ category: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const userId = String(ctx.user.id);
      return getAgentMemory(userId, input?.category);
    }),

  /**
   * Set an agent memory entry
   */
  setAgentMemory: protectedProcedure
    .input(z.object({
      category: z.string(),
      key: z.string().min(1).max(200),
      value: z.string(),
      source: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = String(ctx.user.id);
      const success = await setAgentMemory(userId, input.category, input.key, input.value, input.source);
      return { success };
    }),

  /**
   * Delete a specific agent memory
   */
  deleteAgentMemory: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = String(ctx.user.id);
      const success = await deleteAgentMemory(userId, input.id);
      return { success };
    }),

  /**
   * Clear all agent memories
   */
  clearAgentMemories: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = String(ctx.user.id);
    const success = await clearAllAgentMemory(userId);
    return { success };
  }),

  // ─── Knowledge Base (pgvector) ──────────────────────────────────────────

  /**
   * Add a knowledge entry with auto-generated embedding
   */
  addKnowledge: protectedProcedure
    .input(z.object({
      title: z.string().min(1).max(500),
      content: z.string().min(1),
      metadata: z.record(z.string(), z.any()).optional(),
      source: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = String(ctx.user.id);
      return addKnowledgeEntry({
        userId,
        title: input.title,
        content: input.content,
        metadata: input.metadata,
        source: input.source,
      });
    }),

  /**
   * Semantic search across knowledge base
   */
  searchKnowledge: protectedProcedure
    .input(z.object({
      query: z.string().min(1).max(2000),
      threshold: z.number().min(0).max(1).optional(),
      limit: z.number().int().min(1).max(20).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = String(ctx.user.id);
      return searchKnowledge(userId, input.query, {
        threshold: input.threshold,
        limit: input.limit,
      });
    }),

  /**
   * List knowledge entries
   */
  listKnowledge: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).optional(),
      offset: z.number().int().min(0).optional(),
      source: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const userId = String(ctx.user.id);
      return getUserKnowledge(userId, input || {});
    }),

  /**
   * Delete a knowledge entry
   */
  deleteKnowledge: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = String(ctx.user.id);
      const success = await deleteKnowledgeEntry(userId, input.id);
      return { success };
    }),

  /**
   * Clear all knowledge entries
   */
  clearKnowledge: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = String(ctx.user.id);
    const success = await clearUserKnowledge(userId);
    return { success };
  }),
});
