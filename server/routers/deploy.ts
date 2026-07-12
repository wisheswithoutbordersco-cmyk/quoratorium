/**
 * Deploy Router — Multi-platform deployment (Vercel, Netlify, Railway, Cloudflare)
 */
import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { getProject, getProjectFiles, addOrchestrationEvent, updateProject } from "../db";
import { deployToCloudflare, isCloudflareConfigured } from "../deployer";
import {
  deployToExternalPlatform,
  connectPlatform,
  disconnectPlatform,
  getPlatformStatuses,
  getDeploymentHistory,
  getDeploymentStatus,
  type Platform,
} from "../platformDeployService";

export const deployRouter = router({
  /**
   * Check deployment platform availability and connection status
   */
  status: protectedProcedure.query(async ({ ctx }) => {
    const platforms = await getPlatformStatuses(ctx.user.id);
    return {
      cloudflare: { available: isCloudflareConfigured(), provider: "Cloudflare Pages" },
      platforms,
    };
  }),

  /**
   * Connect a platform (store encrypted token)
   */
  connectPlatform: protectedProcedure
    .input(z.object({
      platform: z.enum(["vercel", "netlify", "railway"]),
      token: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await connectPlatform(ctx.user.id, input.platform, input.token);
      if (!result.success) {
        throw new Error(result.error || "Failed to connect platform");
      }
      return { success: true, username: result.username };
    }),

  /**
   * Disconnect a platform
   */
  disconnectPlatform: protectedProcedure
    .input(z.object({
      platform: z.enum(["vercel", "netlify", "railway"]),
    }))
    .mutation(async ({ ctx, input }) => {
      await disconnectPlatform(ctx.user.id, input.platform);
      return { success: true };
    }),

  /**
   * Deploy a project to an external platform
   */
  deployToPlatform: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      platform: z.enum(["vercel", "netlify", "railway"]),
      commitMessage: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const project = await getProject(input.projectId, userId);
      if (!project) throw new Error("Project not found");

      const files = await getProjectFiles(input.projectId, userId);
      if (files.length === 0) throw new Error("No files to deploy. Build the project first.");

      // Log orchestration event
      await addOrchestrationEvent({
        user_id: userId,
        project_id: input.projectId,
        event_type: "deploy_start",
        agent_name: `Deployer (${input.platform})`,
        summary: `Deploying ${project.name} to ${input.platform}...`,
      });

      const deployableFiles = files
        .filter(f => f.content)
        .map(f => ({ filepath: f.filepath, content: f.content! }));

      const result = await deployToExternalPlatform({
        projectId: input.projectId,
        userId,
        platform: input.platform,
        projectName: project.name,
        files: deployableFiles,
        commitMessage: input.commitMessage,
      });

      if (result.success) {
        await addOrchestrationEvent({
          user_id: userId,
          project_id: input.projectId,
          event_type: "deploy_complete",
          agent_name: `Deployer (${input.platform})`,
          summary: `Deployed to ${result.url}`,
          payload: { url: result.url, platform: input.platform, deploymentId: result.deploymentId },
        });

        // Update project metadata
        await updateProject(input.projectId, userId, {
          metadata: {
            deployUrl: result.url,
            deployPlatform: input.platform,
            deployedAt: Date.now(),
          } as any,
        });

        return { success: true, url: result.url, deploymentId: result.deploymentId };
      } else {
        await addOrchestrationEvent({
          user_id: userId,
          project_id: input.projectId,
          event_type: "deploy_failed",
          agent_name: `Deployer (${input.platform})`,
          summary: `Deployment failed: ${result.error}`,
        });

        throw new Error(result.error || "Deployment failed");
      }
    }),

  /**
   * Deploy to Cloudflare Pages (legacy)
   */
  deploy: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const project = await getProject(input.projectId, userId);
      if (!project) throw new Error("Project not found");

      const files = await getProjectFiles(input.projectId, userId);
      if (files.length === 0) throw new Error("No files to deploy. Build the project first.");

      if (!isCloudflareConfigured()) {
        throw new Error("Cloudflare credentials not configured");
      }

      await addOrchestrationEvent({
        user_id: userId,
        project_id: input.projectId,
        event_type: "deploy_start",
        agent_name: "Deployer (Cloudflare Pages)",
        summary: `Deploying ${project.name} to Cloudflare Pages...`,
      });

      const deployableFiles = files
        .filter(f => f.content)
        .map(f => ({ filepath: f.filepath, content: f.content! }));

      const result = await deployToCloudflare(project.name, deployableFiles);

      if (result.success) {
        await addOrchestrationEvent({
          user_id: userId,
          project_id: input.projectId,
          event_type: "deploy_complete",
          agent_name: "Deployer (Cloudflare Pages)",
          summary: `Deployed to ${result.url}`,
          payload: { url: result.url, projectName: result.projectName },
        });

        await updateProject(input.projectId, userId, {
          metadata: { deployUrl: result.url, deployedAt: Date.now() } as any,
        });

        return { success: true, url: result.url, projectName: result.projectName };
      } else {
        await addOrchestrationEvent({
          user_id: userId,
          project_id: input.projectId,
          event_type: "deploy_failed",
          agent_name: "Deployer (Cloudflare Pages)",
          summary: `Deployment failed: ${result.error}`,
        });

        throw new Error(result.error || "Deployment failed");
      }
    }),

  /**
   * Get deployment history for the current user
   */
  history: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).optional() }).optional())
    .query(async ({ ctx, input }) => {
      return getDeploymentHistory(ctx.user.id, input?.limit || 20);
    }),

  /**
   * Get status of a specific deployment
   */
  getStatus: protectedProcedure
    .input(z.object({ deploymentId: z.number() }))
    .query(async ({ ctx, input }) => {
      const record = await getDeploymentStatus(input.deploymentId, ctx.user.id);
      if (!record) throw new Error("Deployment not found");
      return record;
    }),
});
