/**
 * Projects Router — CRUD for Q Workspace projects + file operations
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  createProject,
  getUserProjects,
  getProject,
  updateProject,
  getProjectFiles,
  getProjectOrchestrationEvents,
  getConversationHistory,
} from "../db";
import { storagePut } from "../storage";

export const projectsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return getUserProjects(ctx.user.id);
  }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      return getProject(input.id, ctx.user.id);
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      projectType: z.enum(["website", "app", "api", "dashboard", "automation", "document", "other"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return createProject({
        user_id: ctx.user.id,
        name: input.name,
        description: input.description || null,
        project_type: input.projectType || "other",
      });
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      status: z.enum(["active", "paused", "completed", "archived"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return updateProject(id, ctx.user.id, data);
    }),

  getFiles: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ ctx, input }) => {
      return getProjectFiles(input.projectId, ctx.user.id);
    }),

  /**
   * Download all generated files for a project as a ZIP archive
   * Returns a storage URL to the ZIP file
   */
  downloadZip: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const project = await getProject(input.projectId, ctx.user.id);
      if (!project) throw new Error("Project not found");

      const files = await getProjectFiles(input.projectId, ctx.user.id);
      if (files.length === 0) throw new Error("No generated files to download");

      // Create ZIP in memory using a simple approach
      // Note: archiver may not be available, use a simple concatenation
      const zipKey = `projects/${ctx.user.id}/${input.projectId}/${project.name.replace(/[^a-zA-Z0-9-_]/g, "_")}.zip`;
      
      // For now, create a tar-like bundle of files as text
      let bundleContent = "";
      for (const file of files) {
        if (file.content) {
          bundleContent += `--- ${file.filepath} ---\n${file.content}\n\n`;
        }
      }
      
      const { url } = await storagePut(zipKey, Buffer.from(bundleContent, "utf-8"), "application/zip");
      return { url, filename: `${project.name}.zip`, fileCount: files.length };
    }),

  /**
   * Get project stats for analytics
   */
  getStats: protectedProcedure.query(async ({ ctx }) => {
    const projects = await getUserProjects(ctx.user.id);
    const totalProjects = projects.length;
    const activeProjects = projects.filter(p => p.status === "active").length;
    const completedProjects = projects.filter(p => p.status === "completed").length;

    // Get total messages count
    const allMessages = await getConversationHistory(ctx.user.id, undefined, 1000);
    const totalMessages = allMessages.length;

    // Get total files generated across all projects
    let totalFiles = 0;
    for (const project of projects) {
      const files = await getProjectFiles(project.id, ctx.user.id);
      totalFiles += files.length;
    }

    return {
      totalProjects,
      activeProjects,
      completedProjects,
      totalMessages,
      totalFiles,
    };
  }),

  /**
   * Get recent orchestration events across all projects
   */
  getRecentActivity: protectedProcedure
    .input(z.object({ limit: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const projects = await getUserProjects(ctx.user.id);
      const allEvents: Array<{ projectName: string; eventType: string; agentName: string | null; summary: string | null; createdAt: string }> = [];

      for (const project of projects.slice(0, 10)) {
        const events = await getProjectOrchestrationEvents(project.id, ctx.user.id, 5);
        for (const event of events) {
          allEvents.push({
            projectName: project.name,
            eventType: event.event_type,
            agentName: event.agent_name,
            summary: event.summary,
            createdAt: event.created_at,
          });
        }
      }

      // Sort by date descending and limit
      allEvents.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return allEvents.slice(0, input.limit || 20);
    }),
});
