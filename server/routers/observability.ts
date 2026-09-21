/**
 * Q Workspace — Observability Router
 *
 * tRPC endpoints for monitoring dashboard: logs, traces, metrics, worker telemetry, errors.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getLogs,
  getTraces,
  getMetrics,
  getWorkerTelemetry,
  getErrorAggregates,
  getObservabilitySummary,
  getExecutionTimeline,
  getPoolHealth,
} from "../observability";

export const observabilityRouter = router({
  summary: protectedProcedure.query(() => {
    return getObservabilitySummary();
  }),

  /** Persisted, authenticated activity across orchestration events, jobs, and API calls. */
  executionTimeline: protectedProcedure
    .input(
      z
        .object({
          hours: z.number().int().min(1).max(168).default(24),
          buckets: z.number().int().min(1).max(96).default(48),
        })
        .optional()
    )
    .query(({ ctx, input }) => {
      return getExecutionTimeline(ctx.user.id, {
        hours: input?.hours ?? 24,
        buckets: input?.buckets ?? 48,
      });
    }),

  /** Provider configuration and recent in-process worker telemetry, without secrets. */
  poolHealth: protectedProcedure.query(() => {
    return getPoolHealth();
  }),

  logs: protectedProcedure
    .input(
      z
        .object({
          level: z.enum(["debug", "info", "warn", "error", "fatal"]).optional(),
          service: z.string().optional(),
          worker: z.string().optional(),
          correlationId: z.string().optional(),
          since: z.number().optional(),
          limit: z.number().min(1).max(500).optional(),
        })
        .optional()
    )
    .query(({ input }) => {
      return getLogs(input || {});
    }),

  traces: protectedProcedure
    .input(
      z
        .object({
          traceId: z.string().optional(),
          service: z.string().optional(),
          worker: z.string().optional(),
          status: z.enum(["running", "completed", "failed"]).optional(),
          since: z.number().optional(),
          limit: z.number().min(1).max(200).optional(),
        })
        .optional()
    )
    .query(({ input }) => {
      return getTraces(input || {});
    }),

  metrics: protectedProcedure
    .input(
      z
        .object({
          name: z.string().optional(),
          since: z.number().optional(),
          limit: z.number().min(1).max(1000).optional(),
        })
        .optional()
    )
    .query(({ input }) => {
      return getMetrics(input?.name, input?.since, input?.limit);
    }),

  workerTelemetry: protectedProcedure
    .input(
      z
        .object({
          worker: z.string().optional(),
        })
        .optional()
    )
    .query(({ input }) => {
      return getWorkerTelemetry(input?.worker);
    }),

  errors: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(100).optional(),
        })
        .optional()
    )
    .query(({ input }) => {
      return getErrorAggregates(input?.limit || 50);
    }),
});
