/**
 * Git Integration tRPC Router
 */
import { z } from "zod";
import {
  businessActionProcedure,
  protectedProcedure,
  router,
} from "../_core/trpc";
import * as github from "../githubService";
import { getActionCatalog } from "../actionCatalog";
import {
  cancelGitHubProposal,
  executeApprovedGitHubProposal,
  getGitHubProposal,
  listGitHubProposals,
} from "../githubProposalService";

export const gitRouter = router({
  // Get connection status
  status: protectedProcedure.query(async ({ ctx }) => {
    const personal = await github.getPersonalGitHubCredentialStatus(ctx.user.id);
    if (personal.connection) {
      const conn = personal.connection;
      return {
        connected: true,
        username: conn.username,
        defaultRepo: conn.defaultRepo || conn.default_repo || null,
        defaultBranch: conn.defaultBranch || conn.default_branch || null,
        connectionSource: "personal" as const,
        reconnectRequired: false,
      };
    }
    // Fallback: check system GitHub token
    const systemUsername = await github.getSystemGitHubUsername();
    if (systemUsername) {
      const defaults = await github.getSystemGitHubDefaults(ctx.user.id);
      return {
        connected: true,
        username: systemUsername,
        defaultRepo: defaults.defaultRepo,
        defaultBranch: defaults.defaultBranch,
        connectionSource: "workspace" as const,
        reconnectRequired: personal.reconnectRequired,
      };
    }
    return {
      connected: false,
      username: null,
      defaultRepo: null,
      defaultBranch: null,
      connectionSource: null,
      reconnectRequired: personal.reconnectRequired,
    };
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

  capabilities: protectedProcedure.query(() => getActionCatalog("GitHub")),

  proposals: protectedProcedure
    .input(
      z
        .object({ limit: z.number().int().min(1).max(100).optional() })
        .optional()
    )
    .query(({ ctx, input }) => listGitHubProposals(ctx.user.id, input?.limit)),

  proposal: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) => getGitHubProposal(ctx.user.id, input.id)),

  cancelProposal: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => cancelGitHubProposal(ctx.user.id, input.id)),

  openPullRequest: businessActionProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        confirmation: z.literal("OPEN_PULL_REQUEST"),
      })
    )
    .mutation(({ ctx, input }) =>
      executeApprovedGitHubProposal(ctx.user.id, input.id)
    ),

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

  overview: protectedProcedure
    .input(
      z.object({
        repo: z.string(),
        projectId: z.number().int().positive().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return github.getRepositoryOverview(
        ctx.user.id,
        input.repo,
        input.projectId
      );
    }),

  tree: protectedProcedure
    .input(
      z.object({
        repo: z.string(),
        reference: z.string().optional(),
        projectId: z.number().int().positive().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return github.getRepositoryTree(
        ctx.user.id,
        input.repo,
        input.reference,
        input.projectId
      );
    }),

  readFile: protectedProcedure
    .input(
      z.object({
        repo: z.string(),
        path: z.string(),
        reference: z.string().optional(),
        projectId: z.number().int().positive().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return github.readRepositoryFile(
        ctx.user.id,
        input.repo,
        input.path,
        input.reference,
        input.projectId
      );
    }),

  searchCode: protectedProcedure
    .input(
      z.object({
        repo: z.string(),
        query: z.string().min(2).max(160),
        projectId: z.number().int().positive().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return github.searchRepositoryCode(
        ctx.user.id,
        input.repo,
        input.query,
        input.projectId
      );
    }),

  // Update default repo/branch
  updateDefaults: protectedProcedure
    .input(
      z.object({
        defaultRepo: z.string().optional(),
        defaultBranch: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return github.updateDefaults(
        ctx.user.id,
        input.defaultRepo,
        input.defaultBranch
      );
    }),
});
