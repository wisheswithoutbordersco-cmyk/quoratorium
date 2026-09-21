import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import {
  getBusinessActionSession,
  isBusinessActionPinConfigured,
} from "../businessActionAuth";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.authenticatedUser) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.authenticatedUser,
      authenticatedUser: ctx.authenticatedUser,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

const requireAuthenticatedUser = t.middleware(async ({ ctx, next }) => {
  if (!ctx.authenticatedUser) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.authenticatedUser,
      authenticatedUser: ctx.authenticatedUser,
    },
  });
});

/** External account data must always be tied to a verified Clerk session. */
export const authenticatedProcedure = t.procedure.use(requireAuthenticatedUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.authenticatedUser || ctx.authenticatedUser.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.authenticatedUser,
        authenticatedUser: ctx.authenticatedUser,
      },
    });
  }),
);

/**
 * Required for procedures that can reach an external business system.
 * A verified workspace session is mandatory first; business procedures then
 * require a separate signed, short-lived action session.
 */
export const businessActionProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.authenticatedUser || !ctx.isOwner) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "This business action is restricted to the owner workspace.",
      });
    }
    if (!isBusinessActionPinConfigured()) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Configure the owner action code before using business actions.",
      });
    }

    const actionSession = getBusinessActionSession(ctx.req, ctx.authenticatedUser.id);
    if (!actionSession) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Unlock business actions to continue.",
      });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.authenticatedUser,
        authenticatedUser: ctx.authenticatedUser,
        businessActionSessionExpiresAt: actionSession.expiresAt,
      },
    });
  }),
);
