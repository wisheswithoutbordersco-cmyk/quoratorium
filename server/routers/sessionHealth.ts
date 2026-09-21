import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getSessionHealth,
  recordMessage,
  syncSessionFromConversation,
  type ConversationHealthContext,
  type PersistedConversationMessage,
} from "../sessionHealth";
import {
  stabilizeSession,
  type ConversationMessage,
} from "../sessionStabilizer";
import * as db from "../db";

const contextMetadataKey = "sessionStabilization";
const recentMessageLimit = 10;

interface StoredStabilizationContext {
  version: 1;
  context: string;
  tokenEstimate: number;
  updatedAt: string;
}

async function getConversationMessages(
  userId: number,
  conversationId: number,
  limit?: number
) {
  const conversation = await db.getConversationForUser(conversationId, userId);
  if (!conversation) throw new Error("Conversation not found");

  const supabase = (await import("../supabase")).getSupabaseAdmin();
  if (!supabase) throw new Error("Conversation storage is unavailable");

  let query = supabase
    .from("messages")
    .select("id, role, content, metadata, created_at")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error)
    throw new Error(`Could not load conversation messages: ${error.message}`);
  return data || [];
}

function readStoredContext(
  messages: Array<{ metadata?: unknown }>
): StoredStabilizationContext | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const metadata = messages[index]?.metadata;
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
      continue;
    const candidate = (metadata as Record<string, unknown>)[contextMetadataKey];
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
      continue;
    const stored = candidate as Partial<StoredStabilizationContext>;
    if (
      stored.version === 1 &&
      typeof stored.context === "string" &&
      typeof stored.tokenEstimate === "number" &&
      Number.isFinite(stored.tokenEstimate)
    ) {
      return stored as StoredStabilizationContext;
    }
  }
  return null;
}

function asHealthMessages(
  messages: Array<{ role: string; content: string }>
): PersistedConversationMessage[] {
  return messages
    .filter(
      message =>
        message.role === "user" ||
        message.role === "assistant" ||
        message.role === "system"
    )
    .map(message => ({
      role: message.role as PersistedConversationMessage["role"],
      content: message.content,
    }));
}

export const sessionHealthRouter = router({
  getHealth: protectedProcedure
    .input(z.object({ conversationId: z.coerce.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const messages = await getConversationMessages(
        ctx.user.id,
        input.conversationId
      );
      const storedContext = readStoredContext(messages);
      const sessionId = `${ctx.user.id}_${input.conversationId}`;
      const healthContext: ConversationHealthContext = {
        compressedTokenEstimate: storedContext?.tokenEstimate,
        recentMessageLimit,
      };
      syncSessionFromConversation(
        sessionId,
        asHealthMessages(messages),
        healthContext
      );
      return getSessionHealth(sessionId);
    }),

  stabilize: protectedProcedure
    .input(z.object({ conversationId: z.coerce.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const messages = await getConversationMessages(
        ctx.user.id,
        input.conversationId
      );
      const sessionId = `${ctx.user.id}_${input.conversationId}`;
      const snapshotMessages: ConversationMessage[] = asHealthMessages(
        messages
      ).map((message, index) => ({
        ...message,
        timestamp: messages[index]?.created_at
          ? new Date(messages[index].created_at).getTime()
          : undefined,
      }));
      const result = await stabilizeSession({
        sessionId,
        messages: snapshotMessages,
      });

      if (!result.success) {
        return {
          success: false,
          summary: result.summary,
          error: result.error || "Conversation stabilization did not complete.",
          discardedCount: 0,
          compressionSavedPercent: 0,
          duration: result.duration,
          originalTokens: result.originalTokenEstimate,
          compressedTokens: result.compressedTokenEstimate,
        };
      }

      const latestMessage = messages[messages.length - 1];
      if (!latestMessage?.id) {
        return {
          success: false,
          summary:
            "Conversation stabilization could not be saved because no message is available to hold its context.",
          error:
            "No persisted message was available for the compressed context.",
          discardedCount: 0,
          compressionSavedPercent: 0,
          duration: result.duration,
          originalTokens: result.originalTokenEstimate,
          compressedTokens: result.compressedTokenEstimate,
        };
      }

      const existingMetadata =
        latestMessage.metadata &&
        typeof latestMessage.metadata === "object" &&
        !Array.isArray(latestMessage.metadata)
          ? (latestMessage.metadata as Record<string, unknown>)
          : {};
      const storedContext: StoredStabilizationContext = {
        version: 1,
        context: result.compressedContext,
        tokenEstimate: result.compressedTokenEstimate,
        updatedAt: new Date().toISOString(),
      };

      try {
        await db.updateConversationMessageMetadata({
          messageId: latestMessage.id,
          conversationId: input.conversationId,
          userId: ctx.user.id,
          metadata: {
            ...existingMetadata,
            [contextMetadataKey]: storedContext,
          },
        });
      } catch (error) {
        return {
          success: false,
          summary:
            "Conversation was compressed but the context could not be saved, so it will not be used on the next response.",
          error:
            error instanceof Error
              ? error.message
              : "Unable to save compressed context.",
          discardedCount: 0,
          compressionSavedPercent: 0,
          duration: result.duration,
          originalTokens: result.originalTokenEstimate,
          compressedTokens: result.compressedTokenEstimate,
        };
      }

      syncSessionFromConversation(sessionId, asHealthMessages(messages), {
        compressedTokenEstimate: storedContext.tokenEstimate,
        recentMessageLimit,
      });

      return {
        success: true,
        summary: result.summary,
        error: null,
        discardedCount: result.discardedCount,
        compressionSavedPercent: Math.max(
          0,
          Math.round((1 - result.compressionRatio) * 100)
        ),
        duration: result.duration,
        originalTokens: result.originalTokenEstimate,
        compressedTokens: result.compressedTokenEstimate,
      };
    }),

  recordMessage: protectedProcedure
    .input(
      z.object({
        conversationId: z.coerce.number().int().positive(),
        tokenCount: z.number().nonnegative(),
        responseContent: z.string(),
        responseTimeMs: z.number().nonnegative(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const sessionId = `${ctx.user.id}_${input.conversationId}`;
      recordMessage(
        sessionId,
        input.tokenCount,
        input.responseContent,
        input.responseTimeMs
      );
      return { success: true };
    }),
});

export function getCompressedConversationContext(
  messages: Array<{ metadata?: unknown }>
): string {
  return readStoredContext(messages)?.context || "";
}

export function getCompressedConversationTokenEstimate(
  messages: Array<{ metadata?: unknown }>
): number {
  return readStoredContext(messages)?.tokenEstimate || 0;
}
