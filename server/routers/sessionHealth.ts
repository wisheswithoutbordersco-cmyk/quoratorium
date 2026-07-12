/**
 * Session Health tRPC Router
 * 
 * Exposes session health monitoring and stabilization to the frontend.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getSessionHealth, getOrCreateSession, recordMessage } from "../sessionHealth";
import { stabilizeSession, type ConversationMessage, type StabilizationSnapshot } from "../sessionStabilizer";
import { recallProtectedMemories } from "../twoTierMemory";
import * as db from "../db";

export const sessionHealthRouter = router({
  /**
   * Get current session health report
   */
  getHealth: protectedProcedure
    .input(z.object({ conversationId: z.string() }))
    .query(async ({ input, ctx }) => {
      const sessionId = `${ctx.user!.id}_${input.conversationId}`;
      const report = getSessionHealth(sessionId);
      return report;
    }),

  /**
   * Trigger manual session stabilization
   */
  stabilize: protectedProcedure
    .input(z.object({ conversationId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user!.id;
      const sessionId = `${userId}_${input.conversationId}`;

      // Get conversation messages from DB
      let messages: ConversationMessage[] = [];
      try {
        const dbMessages = await db.getConversationHistory(userId, null, 200);
        messages = dbMessages.map((m: any) => ({
          role: m.role as "user" | "assistant" | "system",
          content: typeof m.content === "string" ? m.content : JSON.stringify(m.content) || "",
          timestamp: m.created_at ? new Date(m.created_at).getTime() : undefined,
        }));
      } catch {
        // If we can't get messages from DB, use empty array
      }

      // Get protected memories
      let protectedMemories: string[] = [];
      try {
        const memContext = await recallProtectedMemories(String(userId), "session stabilization");
        if (memContext) {
          protectedMemories = memContext.split("\n").filter((l: string) => l.trim().length > 0);
        }
      } catch {
        // Non-blocking
      }

      // Build snapshot
      const snapshot: StabilizationSnapshot = {
        sessionId,
        userId: String(userId),
        messages,
        projectContext: null, // Could be enhanced to include active project
        protectedMemories,
        timestamp: Date.now(),
      };

      // Run stabilization
      const result = await stabilizeSession(snapshot);

      return {
        success: result.success,
        summary: result.summary,
        discardedCount: result.discardedCount,
        compressionRatio: Math.round((1 - result.compressionRatio) * 100),
        duration: result.duration,
        originalTokens: result.originalTokenEstimate,
        compressedTokens: result.compressedTokenEstimate,
      };
    }),

  /**
   * Record a message for health tracking (called by streaming endpoint)
   */
  recordMessage: protectedProcedure
    .input(z.object({
      conversationId: z.string(),
      tokenCount: z.number(),
      responseContent: z.string(),
      responseTimeMs: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const sessionId = `${ctx.user!.id}_${input.conversationId}`;
      recordMessage(sessionId, input.tokenCount, input.responseContent, input.responseTimeMs);
      return { success: true };
    }),
});
