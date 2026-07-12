/**
 * Git Integration tRPC Router
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as github from "../githubService";

export const gitRouter = router({
  // Get connection status
  status: protectedProcedure.query(async ({ ctx }) => {
    const conn = await github.getGitHubConnection(ctx.user.id);
    if (conn) {
      return {
        connected: true,
        username: conn.username,
        defaultRepo: conn.defaultRepo || conn.default_repo || null,
        defaultBranch: conn.defaultBranch || conn.default_branch || null,
      };
    }
    // Fallback: check system GitHub token
    const systemUsername = await github.getSystemGitHubUsername();
    if (systemUsername) {
      return {
        connected: true,
        username: systemUsername,
        defaultRepo: null,
        defaultBranch: "main",
      };
    }
    return { connected: false, username: null, defaultRepo: null, defaultBranch: null };
  }),

  // Connect GitHub with PAT
  connect: protectedProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const result = await github.connectGitHub(ctx.user.id, input.token);
      return result;
    }),

  // Disconnect GitHub
  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    return github.disconnectGitHub(ctx.user.id);
  }),

  // List user's repos
  listRepos: protectedProcedure.query(async ({ ctx }) => {
    return github.listRepos(ctx.user.id);
  }),

  // Create a new repo
  createRepo: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      isPrivate: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return github.createRepo(ctx.user.id, input.name, input.description, input.isPrivate ?? true);
    }),

  // Get commits for a repo
  commits: protectedProcedure
    .input(z.object({ repo: z.string(), branch: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      return github.getCommits(ctx.user.id, input.repo, input.branch);
    }),

  // List branches
  branches: protectedProcedure
    .input(z.object({ repo: z.string() }))
    .query(async ({ ctx, input }) => {
      return github.listBranches(ctx.user.id, input.repo);
    }),

  // Create a branch
  createBranch: protectedProcedure
    .input(z.object({
      repo: z.string(),
      branchName: z.string().min(1),
      fromBranch: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return github.createBranch(ctx.user.id, input.repo, input.branchName, input.fromBranch);
    }),

  // Push files to a repo
  push: protectedProcedure
    .input(z.object({
      repo: z.string(),
      files: z.array(z.object({ path: z.string(), content: z.string() })),
      commitMessage: z.string(),
      branch: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return github.pushFiles(ctx.user.id, input.repo, input.files, input.commitMessage, input.branch);
    }),

  // Pull files from a repo
  pull: protectedProcedure
    .input(z.object({ repo: z.string(), branch: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      return github.pullFiles(ctx.user.id, input.repo, input.branch);
    }),

  // Update default repo/branch
  updateDefaults: protectedProcedure
    .input(z.object({
      defaultRepo: z.string().optional(),
      defaultBranch: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return github.updateDefaults(ctx.user.id, input.defaultRepo, input.defaultBranch);
    }),
});
