/**
 * GitHub tRPC router.
 *
 * Phase 1 exposes repository discovery and source-reading capabilities only.
 * Legacy write procedures remain as hard-blocked compatibility endpoints so an
 * older browser bundle cannot bypass the current policy.
 */
import { z } from "zod";
import { authenticatedProcedure, router } from "../_core/trpc";
import * as github from "../githubService";
import { listActionAudit } from "../actionAudit";
import { getGitHubActionCatalog } from "@shared/actionCatalog";

const repositorySchema = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/,
    "Repository must use the owner/name format"
  );
const refSchema = z.string().trim().min(1).max(255);

export const gitRouter = router({
  status: authenticatedProcedure.query(async ({ ctx }) => {
    const conn = await github.getGitHubConnection(ctx.user.id);
    if (conn) {
      return {
        connected: true,
        username: conn.username,
        allowedRepositories: Array.isArray(conn.allowed_repositories)
          ? conn.allowed_repositories
          : [],
        defaultRepo: conn.defaultRepo || conn.default_repo || null,
        defaultBranch: conn.defaultBranch || conn.default_branch || null,
        connectionType: "personal" as const,
        mode: "read-only" as const,
        canWrite: false,
        canMerge: false,
      };
    }

    return {
      connected: false,
      username: null,
      allowedRepositories: [],
      defaultRepo: null,
      defaultBranch: null,
      connectionType: null,
      mode: "read-only" as const,
      canWrite: false,
      canMerge: false,
    };
  }),

  catalog: authenticatedProcedure.query(() => getGitHubActionCatalog()),

  auditLog: authenticatedProcedure
    .input(
      z
        .object({ limit: z.number().int().min(1).max(250).default(100) })
        .optional()
    )
    .query(({ ctx, input }) =>
      listActionAudit(ctx.user.id, input?.limit || 100)
    ),

  connect: authenticatedProcedure
    .input(
      z.object({
        token: z.string().trim().min(1).max(500),
        repositories: z.array(repositorySchema).min(1).max(100),
      })
    )
    .mutation(({ ctx, input }) =>
      github.connectGitHub(ctx.user.id, input.token, input.repositories)
    ),

  disconnect: authenticatedProcedure.mutation(({ ctx }) =>
    github.disconnectGitHub(ctx.user.id)
  ),

  listRepos: authenticatedProcedure
    .input(
      z
        .object({ limit: z.number().int().min(1).max(100).default(100) })
        .optional()
    )
    .query(({ ctx, input }) =>
      github.listRepos(ctx.user.id, input?.limit || 100)
    ),

  repository: authenticatedProcedure
    .input(z.object({ repo: repositorySchema }))
    .query(({ ctx, input }) => github.getRepository(ctx.user.id, input.repo)),

  commits: authenticatedProcedure
    .input(z.object({ repo: repositorySchema, branch: refSchema.optional() }))
    .query(({ ctx, input }) =>
      github.getCommits(ctx.user.id, input.repo, input.branch)
    ),

  branches: authenticatedProcedure
    .input(z.object({ repo: repositorySchema }))
    .query(({ ctx, input }) => github.listBranches(ctx.user.id, input.repo)),

  tree: authenticatedProcedure
    .input(
      z.object({
        repo: repositorySchema,
        ref: refSchema.optional(),
        pathPrefix: z.string().trim().max(1000).optional(),
        limit: z.number().int().min(1).max(500).default(500),
      })
    )
    .query(({ ctx, input }) =>
      github.listRepositoryTree(
        ctx.user.id,
        input.repo,
        input.ref,
        input.pathPrefix,
        input.limit
      )
    ),

  file: authenticatedProcedure
    .input(
      z.object({
        repo: repositorySchema,
        path: z.string().trim().min(1).max(1000),
        ref: refSchema.optional(),
      })
    )
    .query(({ ctx, input }) =>
      github.readRepositoryFile(ctx.user.id, input.repo, input.path, input.ref)
    ),

  searchCode: authenticatedProcedure
    .input(
      z.object({
        repo: repositorySchema,
        query: z.string().trim().min(1).max(200),
        limit: z.number().int().min(1).max(50).default(20),
      })
    )
    .query(({ ctx, input }) =>
      github.searchRepositoryCode(
        ctx.user.id,
        input.repo,
        input.query,
        input.limit
      )
    ),

  pull: authenticatedProcedure
    .input(z.object({ repo: repositorySchema, branch: refSchema.optional() }))
    .query(({ ctx, input }) =>
      github.pullFiles(ctx.user.id, input.repo, input.branch)
    ),

  updateDefaults: authenticatedProcedure
    .input(
      z.object({
        defaultRepo: repositorySchema.optional(),
        defaultBranch: refSchema.optional(),
      })
    )
    .mutation(({ ctx, input }) =>
      github.updateDefaults(ctx.user.id, input.defaultRepo, input.defaultBranch)
    ),

  // Hard-blocked phase-one compatibility endpoints.
  createRepo: authenticatedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(100),
        description: z.string().max(500).optional(),
        isPrivate: z.boolean().optional(),
      })
    )
    .mutation(({ ctx, input }) =>
      github.createRepo(
        ctx.user.id,
        input.name,
        input.description,
        input.isPrivate ?? true
      )
    ),

  createBranch: authenticatedProcedure
    .input(
      z.object({
        repo: repositorySchema,
        branchName: refSchema,
        fromBranch: refSchema.optional(),
      })
    )
    .mutation(({ ctx, input }) =>
      github.createBranch(
        ctx.user.id,
        input.repo,
        input.branchName,
        input.fromBranch
      )
    ),

  push: authenticatedProcedure
    .input(
      z.object({
        repo: repositorySchema,
        files: z
          .array(z.object({ path: z.string(), content: z.string() }))
          .max(100),
        commitMessage: z.string().trim().min(1).max(500),
        branch: refSchema.optional(),
      })
    )
    .mutation(({ ctx, input }) =>
      github.pushFiles(
        ctx.user.id,
        input.repo,
        input.files,
        input.commitMessage,
        input.branch
      )
    ),
});
