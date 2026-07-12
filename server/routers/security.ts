/**
 * Q Workspace — Security Router
 * 
 * tRPC endpoints for security dashboard: violations, policy, injection checks.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getSecuritySummary,
  getViolations,
  validateCode,
  checkPromptInjection,
  validateNetworkRequest,
  DEFAULT_SECURITY_POLICY,
} from "../security";

export const securityRouter = router({
  summary: protectedProcedure.query(() => {
    return getSecuritySummary();
  }),

  violations: protectedProcedure
    .input(z.object({
      type: z.string().optional(),
      severity: z.string().optional(),
      since: z.number().optional(),
      limit: z.number().min(1).max(200).optional(),
    }).optional())
    .query(({ input }) => {
      return getViolations(input || {});
    }),

  policy: protectedProcedure.query(() => {
    return DEFAULT_SECURITY_POLICY;
  }),

  validateCode: protectedProcedure
    .input(z.object({
      code: z.string(),
      language: z.string(),
    }))
    .mutation(({ input }) => {
      return validateCode(input.code, input.language);
    }),

  checkInjection: protectedProcedure
    .input(z.object({
      text: z.string(),
    }))
    .mutation(({ input }) => {
      return checkPromptInjection(input.text);
    }),

  validateNetwork: protectedProcedure
    .input(z.object({
      url: z.string(),
    }))
    .mutation(({ input }) => {
      return validateNetworkRequest(input.url);
    }),
});
