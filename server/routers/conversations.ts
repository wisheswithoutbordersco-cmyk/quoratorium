import { z } from "zod";
import { protectedProcedure } from "../_core/trpc";
import { router } from "../_core/trpc";
import { getSupabaseAdmin } from "../supabase";
import { invokeLLM } from "../_core/llm";
import {
  deleteConversationAssetReferences,
  rehydrateAttachmentMetadata,
} from "../chatAssets";

function getDb() {
  const client = getSupabaseAdmin();
  if (!client) return null;
  return client;
}

export const conversationsRouter = router({
  // List all conversations for the current user
  list: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) return [];
      const limit = input?.limit || 50;
      const { data, error } = await db
        .from("conversations")
        .select("id, title, project_id, created_at, updated_at")
        .eq("user_id", ctx.user.id)
        .order("updated_at", { ascending: false })
        .limit(limit);
      if (error) { console.error("[Conversations] list error:", error.message); return []; }
      // Map snake_case to camelCase for frontend compatibility
      return (data || []).map(r => ({
        id: r.id,
        title: r.title,
        projectId: r.project_id,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    }),

  // Get a single conversation with all messages
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) return null;
      const { data: conv } = await db
        .from("conversations")
        .select("*")
        .eq("id", input.id)
        .eq("user_id", ctx.user.id)
        .single();
      if (!conv) return null;
      const { data: msgs } = await db
        .from("messages")
        .select("*")
        .eq("conversation_id", input.id)
        .order("created_at", { ascending: true });
      return {
        id: conv.id,
        userId: conv.user_id,
        title: conv.title,
        projectId: conv.project_id,
        createdAt: conv.created_at,
        updatedAt: conv.updated_at,
        messages: await Promise.all((msgs || []).map(async m => ({
          id: m.id,
          conversationId: m.conversation_id,
          userId: m.user_id,
          role: m.role,
          content: m.content,
          metadata: Array.isArray(m.metadata?.attachments)
            ? {
                ...m.metadata,
                attachments: await rehydrateAttachmentMetadata(m.metadata.attachments),
              }
            : m.metadata,
          createdAt: m.created_at,
        }))),
      };
    }),

  // Create a new conversation
  create: protectedProcedure
    .input(z.object({
      title: z.string().optional(),
      projectId: z.number().optional(),
    }).optional())
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new Error("Database not available");
      const { data, error } = await db
        .from("conversations")
        .insert({
          user_id: ctx.user.id,
          title: input?.title || null,
          project_id: input?.projectId || null,
        })
        .select("id")
        .single();
      if (error) throw new Error(`Failed to create conversation: ${error.message}`);
      return { id: data.id };
    }),

  // Add a message to a conversation
  addMessage: protectedProcedure
    .input(z.object({
      conversationId: z.number(),
      role: z.enum(["user", "assistant", "system"]),
      content: z.string(),
      metadata: z.any().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new Error("Database not available");
      // Verify ownership
      const { data: conv } = await db
        .from("conversations")
        .select("id, title")
        .eq("id", input.conversationId)
        .eq("user_id", ctx.user.id)
        .single();
      if (!conv) throw new Error("Conversation not found");
      const { data: msg, error } = await db
        .from("messages")
        .insert({
          conversation_id: input.conversationId,
          user_id: ctx.user.id,
          role: input.role,
          content: input.content,
          metadata: input.metadata || null,
        })
        .select("id")
        .single();
      if (error) throw new Error(`Failed to add message: ${error.message}`);
      // Auto-title if first user message and no title
      if (!conv.title && input.role === "user") {
        generateTitle(input.content, input.conversationId).catch(() => {});
      }
      return { id: msg.id };
    }),

  // Delete a conversation
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) return false;
      const { data: conv } = await db
        .from("conversations")
        .select("id")
        .eq("id", input.id)
        .eq("user_id", ctx.user.id)
        .single();
      if (!conv) return false;
      // Remove durable file references, then delete messages and conversation.
      // The storage template intentionally treats an unreferenced key as deleted.
      await deleteConversationAssetReferences(ctx.user.id, input.id);
      await db.from("messages").delete().eq("conversation_id", input.id);
      await db.from("conversations").delete().eq("id", input.id);
      return true;
    }),

  // Update conversation title
  updateTitle: protectedProcedure
    .input(z.object({ id: z.number(), title: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) return false;
      await db
        .from("conversations")
        .update({ title: input.title })
        .eq("id", input.id)
        .eq("user_id", ctx.user.id);
      return true;
    }),
});

/**
 * Auto-generate a 3-5 word title for a conversation using LLM
 */
async function generateTitle(firstMessage: string, conversationId: number): Promise<void> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "Generate a concise 3-5 word title for this conversation. Return ONLY the title, no quotes, no punctuation at the end.",
        },
        { role: "user", content: firstMessage.slice(0, 200) },
      ],
    });
    const rawContent = response.choices?.[0]?.message?.content;
    const title = typeof rawContent === "string" ? rawContent.trim() : null;
    if (title && title.length < 100) {
      const db = getDb();
      if (!db) return;
      await db
        .from("conversations")
        .update({ title })
        .eq("id", conversationId);
    }
  } catch (err) {
    console.warn("[Conversations] Auto-title generation failed:", err);
  }
}
