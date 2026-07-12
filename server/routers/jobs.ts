/**
 * Jobs Router — tRPC endpoints for the async job queue
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { jobQueue, type JobType, type JobPriority } from "../jobQueue";

const jobTypeEnum = z.enum([
  "ai_chat", "code_generation", "code_validation", "research",
  "image_generation", "browser_task", "code_execution", "embedding", "deployment"
]);

const jobPriorityEnum = z.enum(["critical", "high", "normal", "low"]);
const jobStatusEnum = z.enum(["queued", "processing", "completed", "failed", "retrying", "cancelled", "dead_letter"]);

export const jobsRouter = router({
  /**
   * Create a new job
   */
  create: protectedProcedure
    .input(z.object({
      type: jobTypeEnum,
      payload: z.record(z.string(), z.any()),
      priority: jobPriorityEnum.optional(),
      timeout: z.number().min(1000).max(300000).optional(),
      maxRetries: z.number().min(0).max(10).optional(),
      projectId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const job = await jobQueue.createJob({
        type: input.type as JobType,
        userId: ctx.user.id,
        payload: input.payload,
        priority: (input.priority as JobPriority) || "normal",
        timeout: input.timeout,
        maxRetries: input.maxRetries,
        projectId: input.projectId,
      });
      return job;
    }),

  /**
   * Get a specific job by ID
   */
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const job = await jobQueue.getJob(input.id);
      if (!job || job.user_id !== ctx.user.id) return null;
      return job;
    }),

  /**
   * List jobs with filters
   */
  list: protectedProcedure
    .input(z.object({
      status: jobStatusEnum.optional(),
      type: jobTypeEnum.optional(),
      limit: z.number().min(1).max(100).optional(),
      offset: z.number().min(0).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      return jobQueue.listJobs({
        userId: ctx.user.id,
        status: input?.status as any,
        type: input?.type as any,
        limit: input?.limit,
        offset: input?.offset,
      });
    }),

  /**
   * Cancel a job
   */
  cancel: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const success = await jobQueue.cancelJob(input.id, ctx.user.id);
      return { success };
    }),

  /**
   * Retry a failed job
   */
  retry: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const job = await jobQueue.retryJob(input.id, ctx.user.id);
      return job;
    }),

  /**
   * Get queue statistics
   */
  stats: protectedProcedure
    .query(async ({ ctx }) => {
      return jobQueue.getStats(ctx.user.id);
    }),
});
