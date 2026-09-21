/**
 * Costs Router — tRPC endpoints for AI cost governance
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getCostSummary,
  getCostHistory,
  getCostBreakdown,
  getBudgetStatus,
  updateBudgetLimits,
  updateBudgetPolicy,
} from "../costService";

export const costsRouter = router({
  /**
   * Get current spend summary (today, month, total, projections)
   */
  summary: protectedProcedure.query(async ({ ctx }) => {
    return getCostSummary(ctx.user.id);
  }),

  /**
   * Get historical cost data (daily aggregates)
   */
  history: protectedProcedure
    .input(
      z
        .object({
          days: z.number().min(1).max(365).optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      return getCostHistory(ctx.user.id, input?.days || 30);
    }),

  /**
   * Get budget status (limits, spend, remaining, alerts)
   */
  budget: protectedProcedure.query(async ({ ctx }) => {
    return getBudgetStatus(ctx.user.id);
  }),

  /**
   * Update budget limits
   */
  updateBudget: protectedProcedure
    .input(
      z.object({
        dailyLimit: z.coerce.number().min(0).max(1_000_000).optional(),
        monthlyLimit: z.coerce.number().min(0).max(1_000_000).optional(),
        warningThreshold: z.coerce.number().int().min(1).max(100).optional(),
        autoPause: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await updateBudgetLimits(ctx.user.id, {
        dailyLimit: input.dailyLimit?.toFixed(2),
        monthlyLimit: input.monthlyLimit?.toFixed(2),
      });
      await updateBudgetPolicy(ctx.user.id, {
        warningThreshold: input.warningThreshold,
        autoPause: input.autoPause,
      });
      return { success: true };
    }),

  /**
   * Get detailed cost breakdown by model, worker, and project
   */
  breakdown: protectedProcedure.query(async ({ ctx }) => {
    return getCostBreakdown(ctx.user.id);
  }),
});
