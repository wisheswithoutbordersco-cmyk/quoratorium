import { TRPCError } from "@trpc/server";
import { recyclatoriumAnalysisInputSchema } from "@shared/recyclatorium";
import { protectedProcedure, router } from "../_core/trpc";
import {
  analyzeRecyclatoriumAssets,
  RecyclatoriumInputError,
  RecyclatoriumRateLimitError,
} from "../recyclatoriumService";

export {
  parseRecyclatoriumPlan,
  RECYCLATORIUM_ANALYSIS_MODEL,
  RECYCLATORIUM_FALLBACK_MODEL,
} from "../recyclatoriumService";

export const recyclatoriumRouter = router({
  analyze: protectedProcedure
    .input(recyclatoriumAnalysisInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await analyzeRecyclatoriumAssets({
          userId: ctx.user.id,
          mode: input.mode,
          assets: input.assets,
        });
      } catch (error) {
        if (error instanceof RecyclatoriumInputError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        if (error instanceof RecyclatoriumRateLimitError) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: error.message,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Recyclatorium analysis failed.",
        });
      }
    }),
});
