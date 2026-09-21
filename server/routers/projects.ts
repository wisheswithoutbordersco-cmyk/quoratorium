/**
 * Projects Router — CRUD for Q Workspace projects + file operations
 */
import { z } from "zod";
import JSZip from "jszip";
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
import type { GeneratedFile } from "../db";
import { storageGetSignedUrl, storagePut } from "../storage";

/**
 * Return a safe, project-relative ZIP entry path. Generated file paths are
 * persisted data, so never pass them directly to a ZIP writer: absolute paths
 * and `..` segments would create a zip-slip archive when extracted.
 */
export function sanitizeProjectRelativePath(
  pathname: string | null | undefined,
  fallback: string
): string {
  const source = (pathname || fallback).replace(/\0/g, "").replace(/\\/g, "/");
  const segments = source
    .split("/")
    .filter(
      segment => segment.length > 0 && segment !== "." && segment !== ".."
    )
    .map(segment => segment.replace(/[:*?"<>|]/g, "_").trim())
    .filter(Boolean);

  if (segments.length > 0) return segments.join("/");

  const safeFallback = fallback
    .replace(/\0/g, "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/^\.+$/, "generated-file")
    .trim();
  return safeFallback || "generated-file";
}

function makeUniqueArchivePath(
  pathname: string,
  usedPaths: Set<string>
): string {
  if (!usedPaths.has(pathname)) {
    usedPaths.add(pathname);
    return pathname;
  }

  const slashIndex = pathname.lastIndexOf("/");
  const directory = slashIndex >= 0 ? pathname.slice(0, slashIndex + 1) : "";
  const basename = slashIndex >= 0 ? pathname.slice(slashIndex + 1) : pathname;
  const dotIndex = basename.lastIndexOf(".");
  const stem = dotIndex > 0 ? basename.slice(0, dotIndex) : basename;
  const extension = dotIndex > 0 ? basename.slice(dotIndex) : "";

  let counter = 2;
  let candidate = `${directory}${stem} (${counter})${extension}`;
  while (usedPaths.has(candidate)) {
    counter += 1;
    candidate = `${directory}${stem} (${counter})${extension}`;
  }
  usedPaths.add(candidate);
  return candidate;
}

async function getGeneratedFileArchiveContent(
  file: GeneratedFile
): Promise<string | Buffer> {
  if (file.content !== null) return file.content;

  let sourceUrl = file.file_url;
  if (!sourceUrl && file.file_key) {
    sourceUrl = await storageGetSignedUrl(file.file_key);
  }
  if (!sourceUrl) {
    throw new Error(
      `Generated file "${file.filepath || file.filename}" has no exportable content`
    );
  }

  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(
      `Could not read generated file "${file.filepath || file.filename}" for export`
    );
  }
  return Buffer.from(await response.arrayBuffer());
}

export async function createProjectZip(
  files: GeneratedFile[]
): Promise<Buffer> {
  const zip = new JSZip();
  const usedPaths = new Set<string>();

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const fallback = file.filename || `generated-file-${index + 1}`;
    const entryPath = makeUniqueArchivePath(
      sanitizeProjectRelativePath(file.filepath, fallback),
      usedPaths
    );
    // Pass persisted source bytes through unchanged. If an older record stores
    // the file externally rather than inline, retrieve those bytes before ZIP
    // generation rather than silently creating an empty archive entry.
    zip.file(entryPath, await getGeneratedFileArchiveContent(file));
  }

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });
}

function makeArchiveFilename(projectName: string): string {
  const basename = sanitizeProjectRelativePath(projectName, "project").replace(
    /\//g,
    "_"
  );
  return `${basename.replace(/\.zip$/i, "") || "project"}.zip`;
}

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
    .input(
      z.object({
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        projectType: z
          .enum([
            "website",
            "app",
            "api",
            "dashboard",
            "automation",
            "document",
            "other",
          ])
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return createProject({
        user_id: ctx.user.id,
        name: input.name,
        description: input.description || null,
        project_type: input.projectType || "other",
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        status: z
          .enum(["active", "paused", "completed", "archived"])
          .optional(),
      })
    )
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

      const filename = makeArchiveFilename(project.name);
      const zipKey = `projects/${ctx.user.id}/${input.projectId}/${filename}`;
      const archive = await createProjectZip(files);
      const stored = await storagePut(zipKey, archive, "application/zip");
      // storagePut may return a storage proxy on the Forge backend. Resolve the
      // stored key so callers always receive a fresh, directly usable signed URL.
      const url = await storageGetSignedUrl(stored.key);

      return { url, filename, fileCount: files.length };
    }),

  /**
   * Get project stats for analytics
   */
  getStats: protectedProcedure.query(async ({ ctx }) => {
    const projects = await getUserProjects(ctx.user.id);
    const totalProjects = projects.length;
    const activeProjects = projects.filter(p => p.status === "active").length;
    const completedProjects = projects.filter(
      p => p.status === "completed"
    ).length;

    // Get total messages count
    const allMessages = await getConversationHistory(
      ctx.user.id,
      undefined,
      1000
    );
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
      const allEvents: Array<{
        projectName: string;
        eventType: string;
        agentName: string | null;
        summary: string | null;
        createdAt: string;
      }> = [];

      for (const project of projects.slice(0, 10)) {
        const events = await getProjectOrchestrationEvents(
          project.id,
          ctx.user.id,
          5
        );
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
      allEvents.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      return allEvents.slice(0, input.limit || 20);
    }),
});
