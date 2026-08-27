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
 * Required for procedures that can reach an external business system.
 * Normal Captain Q chat keeps the existing workspace access behavior, while
 * business procedures require a separate signed, short-lived owner session.
 */
export const businessActionProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user || !ctx.isOwner) {
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

    const actionSession = getBusinessActionSession(ctx.req, ctx.user.id);
    if (!actionSession) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Unlock business actions to continue.",
      });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
        businessActionSessionExpiresAt: actionSession.expiresAt,
      },
    });
  }),
);
