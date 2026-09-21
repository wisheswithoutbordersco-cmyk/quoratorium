import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getOwnerUser } from "./_core/context";
import {
  clearOwnerAccessSession,
  isOwnerAccessConfigured,
  startOwnerAccessSession,
  verifyOwnerAccessCode,
} from "./ownerAccessAuth";
import { clearBusinessActionSession } from "./businessActionAuth";
import { aiRouter } from "./routers/ai";
import { projectsRouter } from "./routers/projects";
import { memoryRouter } from "./routers/memory";
import { vaultRouter } from "./routers/vault";
import { filesRouter } from "./routers/files";
import { deployRouter } from "./routers/deploy";
import { jobsRouter } from "./routers/jobs";
import { costsRouter } from "./routers/costs";
import { observabilityRouter } from "./routers/observability";
import { securityRouter } from "./routers/security";
import { knowledgeRouter } from "./routers/knowledge";
import { conversationsRouter } from "./routers/conversations";
import { gitRouter } from "./routers/git";
import { settingsRouter } from "./routers/settings";
import { sharingRouter } from "./routers/sharing";
import { globalMemoryRouter } from "./routers/globalMemory";
import { billingRouter } from "./routers/billing";
import { sessionHealthRouter } from "./routers/sessionHealth";
import { businessActionsRouter } from "./routers/businessActions";
import { recyclatoriumRouter } from "./routers/recyclatorium";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    session: publicProcedure.query(({ ctx }) => ({
      authenticated: Boolean(ctx.authenticatedUser),
      isVerifiedOwner: Boolean(ctx.isVerifiedOwner),
      user: ctx.authenticatedUser
        ? {
            id: ctx.authenticatedUser.id,
            name: ctx.authenticatedUser.name,
            email: ctx.authenticatedUser.email,
            role: ctx.authenticatedUser.role,
          }
        : null,
    })),
    accessStatus: publicProcedure.query(({ ctx }) => ({
      configured: isOwnerAccessConfigured(),
      authenticated: Boolean(ctx.authenticatedUser),
      isOwner: Boolean(ctx.isVerifiedOwner),
    })),
    unlock: publicProcedure
      .input(z.object({ code: z.string().trim().min(8).max(128) }))
      .mutation(async ({ ctx, input }) => {
        if (!isOwnerAccessConfigured()) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Server-side owner access is not configured.",
          });
        }

        const verification = verifyOwnerAccessCode(ctx.req, input.code);
        if (!verification.ok) {
          if (verification.retryAfterSeconds) {
            throw new TRPCError({
              code: "TOO_MANY_REQUESTS",
              message: `Too many attempts. Try again in ${verification.retryAfterSeconds} seconds.`,
            });
          }
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "The owner access code is incorrect.",
          });
        }

        const owner = await getOwnerUser();
        if (!owner) {
          throw new TRPCError({
            code: "SERVICE_UNAVAILABLE",
            message: "The owner workspace is unavailable.",
          });
        }

        return {
          authenticated: true,
          isOwner: true,
          ...startOwnerAccessSession(ctx.res, owner.id),
        };
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      clearOwnerAccessSession(ctx.res);
      clearBusinessActionSession(ctx.res);
      return { success: true } as const;
    }),
  }),
  ai: aiRouter,
  projects: projectsRouter,
  memory: memoryRouter,
  vault: vaultRouter,
  files: filesRouter,
  deploy: deployRouter,
  jobs: jobsRouter,
  costs: costsRouter,
  observability: observabilityRouter,
  security: securityRouter,
  knowledge: knowledgeRouter,
  conversations: conversationsRouter,
  git: gitRouter,
  settings: settingsRouter,
  sharing: sharingRouter,
  globalMemory: globalMemoryRouter,
  billing: billingRouter,
  sessionHealth: sessionHealthRouter,
  businessActions: businessActionsRouter,
  recyclatorium: recyclatoriumRouter,
});

export type AppRouter = typeof appRouter;
