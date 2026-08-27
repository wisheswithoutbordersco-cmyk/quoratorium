import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

/**
 * Required for actions that can mutate an external business system.
 * Unlike protectedProcedure and adminProcedure, this middleware never accepts
 * the legacy ordinary-workspace owner fallback as proof of identity.
 */
export const verifiedOwnerProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.authenticatedUser) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Sign in as the verified owner to continue.",
      });
    }
    if (!ctx.isVerifiedOwner) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "This business action is restricted to the verified owner.",
      });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.authenticatedUser,
        authenticatedUser: ctx.authenticatedUser,
        isVerifiedOwner: true as const,
      },
    });
  }),
);
