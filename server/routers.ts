import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
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
    logout: publicProcedure.mutation(() => {
      // With Clerk, logout is handled client-side via Clerk's signOut()
      // This endpoint exists for backward compatibility
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
});

export type AppRouter = typeof appRouter;
