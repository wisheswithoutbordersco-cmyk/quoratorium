import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { businessActionProcedure, protectedProcedure, router } from "../_core/trpc";
import {
  BUSINESS_ACTION_SESSION_TTL_MINUTES,
  clearBusinessActionSession,
  getBusinessActionSession,
  isBusinessActionPinConfigured,
  startBusinessActionSession,
  verifyBusinessActionPin,
} from "../businessActionAuth";
import {
  deleteShopifyConnection,
  saveShopifyConnection,
} from "../businessCredentials";
import {
  getBusinessAction,
  listBusinessActions,
  transitionBusinessAction,
} from "../businessActions";
import {
  editShopifyProductDraft,
  executeShopifyProductDraft,
  getShopifyConnectionStatus,
  proposeShopifyProductDraft,
  shopifyDraftInputSchema,
  verifyShopifyConnection,
} from "../shopifyDrafts";

export const businessActionsRouter = router({
  sessionStatus: protectedProcedure.query(({ ctx }) => {
    if (!ctx.user || !ctx.isOwner) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Business actions are restricted to the owner workspace.",
      });
    }
    const session = getBusinessActionSession(ctx.req, ctx.user.id);
    return {
      configured: isBusinessActionPinConfigured(),
      unlocked: Boolean(session),
      expiresAt: session ? new Date(session.expiresAt).toISOString() : null,
      ttlMinutes: BUSINESS_ACTION_SESSION_TTL_MINUTES,
    };
  }),

  unlock: protectedProcedure
    .input(z.object({ code: z.string().trim().min(8).max(128) }))
    .mutation(({ ctx, input }) => {
      if (!ctx.user || !ctx.isOwner) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Business actions are restricted to the owner workspace.",
        });
      }
      if (!isBusinessActionPinConfigured()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Configure the owner action code in Railway first.",
        });
      }

      const verification = verifyBusinessActionPin(ctx.req, input.code);
      if (!verification.ok) {
        if (verification.retryAfterSeconds) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Too many attempts. Try again in ${verification.retryAfterSeconds} seconds.`,
          });
        }
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "The owner action code is incorrect.",
        });
      }

      return {
        unlocked: true,
        ...startBusinessActionSession(ctx.res, ctx.user.id),
      };
    }),

  lock: protectedProcedure.mutation(({ ctx }) => {
    clearBusinessActionSession(ctx.res);
    return { locked: true };
  }),

  connectionStatus: businessActionProcedure.query(async ({ ctx }) => ({
    shopify: await getShopifyConnectionStatus(ctx.user.id),
  })),

  connectShopify: businessActionProcedure
    .input(z.object({
      shopDomain: z.string().trim().min(3).max(255),
      accessToken: z.string().trim().min(20).max(1000),
    }))
    .mutation(async ({ ctx, input }) => {
      const verified = await verifyShopifyConnection(input);
      await saveShopifyConnection({
        userId: ctx.user.id,
        shopDomain: verified.shopDomain,
        accessToken: input.accessToken,
      });
      return {
        configured: true,
        shopDomain: verified.shopDomain,
        shopName: verified.shopName,
      };
    }),

  disconnectShopify: businessActionProcedure.mutation(async ({ ctx }) => ({
    disconnected: await deleteShopifyConnection(ctx.user.id),
  })),

  list: businessActionProcedure
    .input(z.object({
      conversationId: z.number().int().positive().optional(),
      includeTerminal: z.boolean().optional(),
    }).optional())
    .query(({ ctx, input }) => listBusinessActions(ctx.user.id, {
      conversationId: input?.conversationId,
      includeTerminal: input?.includeTerminal,
    })),

  proposeShopifyDraft: businessActionProcedure
    .input(z.object({
      conversationId: z.number().int().positive().optional(),
      product: shopifyDraftInputSchema,
    }))
    .mutation(({ ctx, input }) => proposeShopifyProductDraft({
      userId: ctx.user.id,
      conversationId: input.conversationId,
      product: input.product,
    })),

  editShopifyDraft: businessActionProcedure
    .input(z.object({
      actionId: z.string().regex(/^\d+$/),
      product: shopifyDraftInputSchema,
    }))
    .mutation(({ ctx, input }) => editShopifyProductDraft({
      userId: ctx.user.id,
      actionId: input.actionId,
      product: input.product,
    })),

  cancel: businessActionProcedure
    .input(z.object({ actionId: z.string().regex(/^\d+$/) }))
    .mutation(({ ctx, input }) => transitionBusinessAction(
      ctx.user.id,
      input.actionId,
      ["proposed", "confirmed"],
      "cancelled",
    )),

  confirmShopifyDraft: businessActionProcedure
    .input(z.object({ actionId: z.string().regex(/^\d+$/) }))
    .mutation(async ({ ctx, input }) => {
      const connection = await getShopifyConnectionStatus(ctx.user.id);
      if (!connection.configured) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Connect Shopify before confirming this draft.",
        });
      }

      const current = await getBusinessAction(ctx.user.id, input.actionId);
      if (!current) throw new TRPCError({ code: "NOT_FOUND" });
      if (current.type !== "shopify.create_product_draft") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Not a Shopify draft action." });
      }
      if (current.status === "completed") return current;
      if (!["proposed", "confirmed"].includes(current.status)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `This action cannot run from status ${current.status}.`,
        });
      }

      let confirmed = current;
      if (confirmed.status === "proposed") {
        confirmed = await transitionBusinessAction(
          ctx.user.id,
          confirmed.id,
          ["proposed"],
          "confirmed",
        );
      }
      const executing = await transitionBusinessAction(
        ctx.user.id,
        confirmed.id,
        ["confirmed"],
        "executing",
      );

      try {
        const result = await executeShopifyProductDraft(executing);
        return transitionBusinessAction(
          ctx.user.id,
          executing.id,
          ["executing"],
          "completed",
          { result },
        );
      } catch (error: any) {
        return transitionBusinessAction(
          ctx.user.id,
          executing.id,
          ["executing"],
          "failed",
          { error: error?.message || "Shopify draft creation failed" },
        );
      }
    }),
});
