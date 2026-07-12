/**
 * Export & Sharing tRPC Router
 * Handles: project export (ZIP), conversation export (MD), sharing links (Supabase)
 */
import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { getSupabaseAdmin } from "../supabase";
import crypto from "crypto";

function getDb() {
  const client = getSupabaseAdmin();
  if (!client) return null;
  return client;
}

function generateSlug(): string {
  return crypto.randomBytes(6).toString("base64url").toLowerCase().slice(0, 10);
}

export const sharingRouter = router({
  // ─── Project Export ──────────────────────────────────────────────────────────

  // Export project as structured data (frontend will create ZIP)
  exportProject: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new Error("Database not available");

      const { data: project } = await db
        .from("projects")
        .select("*")
        .eq("id", input.projectId)
        .eq("user_id", ctx.user.id)
        .single();

      if (!project) throw new Error("Project not found");

      return {
        name: project.name,
        description: project.description,
        metadata: {
          createdAt: project.created_at,
          updatedAt: project.updated_at,
          projectType: project.project_type,
        },
      };
    }),

  // ─── Conversation Export ─────────────────────────────────────────────────────

  // Export conversation as Markdown
  exportConversation: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new Error("Database not available");

      const { data: convo } = await db
        .from("conversations")
        .select("*")
        .eq("id", input.conversationId)
        .eq("user_id", ctx.user.id)
        .single();

      if (!convo) throw new Error("Conversation not found");

      const { data: msgs } = await db
        .from("messages")
        .select("*")
        .eq("conversation_id", input.conversationId)
        .order("created_at", { ascending: true });

      // Build markdown
      let md = `# ${convo.title || "Conversation"}\n\n`;
      md += `*Exported from Q Workspace on ${new Date().toISOString().split("T")[0]}*\n\n---\n\n`;

      for (const msg of msgs || []) {
        const role = msg.role === "user" ? "**You**" : "**Captain Q**";
        md += `### ${role}\n\n${msg.content}\n\n---\n\n`;
      }

      return {
        title: convo.title || "Conversation",
        markdown: md,
        messageCount: (msgs || []).length,
      };
    }),

  // ─── Sharing ─────────────────────────────────────────────────────────────────

  // Create a share link for a project
  createShareLink: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      title: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new Error("Database not available");

      // Verify ownership
      const { data: project } = await db
        .from("projects")
        .select("*")
        .eq("id", input.projectId)
        .eq("user_id", ctx.user.id)
        .single();

      if (!project) throw new Error("Project not found");

      // Check if already shared
      const { data: existing } = await db
        .from("shared_projects")
        .select("slug")
        .eq("project_id", input.projectId)
        .eq("user_id", ctx.user.id)
        .eq("is_active", true)
        .limit(1);

      if (existing && existing.length > 0) {
        return { slug: existing[0].slug, alreadyShared: true };
      }

      const slug = generateSlug();
      await db.from("shared_projects").insert({
        project_id: input.projectId,
        user_id: ctx.user.id,
        slug,
        title: input.title || project.name,
        description: input.description || project.description,
        is_active: true,
      });

      return { slug, alreadyShared: false };
    }),

  // List my shared projects
  listShared: protectedProcedure.query(async ({ ctx }) => {
    const db = getDb();
    if (!db) return [];

    const { data } = await db
      .from("shared_projects")
      .select("*")
      .eq("user_id", ctx.user.id);

    return data || [];
  }),

  // Revoke a share link
  revokeShareLink: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (!db) throw new Error("Database not available");

      await db
        .from("shared_projects")
        .update({ is_active: false })
        .eq("id", input.id)
        .eq("user_id", ctx.user.id);

      return { success: true };
    }),

  // ─── Public View (no auth required) ─────────────────────────────────────────

  // Get shared project by slug (public)
  getShared: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new Error("Database not available");

      const { data: shared } = await db
        .from("shared_projects")
        .select("*")
        .eq("slug", input.slug)
        .eq("is_active", true)
        .single();

      if (!shared) throw new Error("Shared project not found or link has been revoked");

      // Increment view count
      await db
        .from("shared_projects")
        .update({ view_count: shared.view_count + 1 })
        .eq("id", shared.id);

      // Get project data
      const { data: project } = await db
        .from("projects")
        .select("*")
        .eq("id", shared.project_id)
        .single();

      if (!project) throw new Error("Project not found");

      // Get generated files for the project
      const { data: files } = await db
        .from("generated_files")
        .select("id, filename, filepath, content, language, mime_type")
        .eq("project_id", shared.project_id);

      return {
        title: shared.title,
        description: shared.description,
        viewCount: shared.view_count + 1,
        createdAt: shared.created_at,
        project: {
          name: project.name,
          description: project.description,
          projectType: project.project_type,
        },
        files: (files || []).map(f => ({
          id: f.id,
          filename: f.filename,
          filepath: f.filepath,
          content: f.content || "",
          language: f.language || "text",
        })),
      };
    }),
});
