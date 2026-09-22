import { z } from "zod";
import { getActionCatalog } from "../actionCatalog";
import { protectedProcedure, router } from "../_core/trpc";
import { getUserOrchestrationEvents } from "../db";

const AUDITED_PREFIXES = [
  "github_",
  "recyclatorium_",
  "extractorium_",
  "templatorium_",
  "scriptorium_",
  "colloquiorium_",
  "deployorium_",
  "repositorium_",
  "listorium_",
  "shopify_",
];

function isCapabilityEvent(eventType: string): boolean {
  return AUDITED_PREFIXES.some(prefix => eventType.startsWith(prefix));
}

function safePayload(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const allowed = [
    "capability",
    "permission",
    "risk",
    "confirmation",
    "action",
    "repository",
    "reference",
    "path",
    "resultCount",
    "mode",
    "assetNames",
    "activityCount",
    "fallbackUsed",
    "outcome",
    "proposalId",
    "pullRequestUrl",
    "system",
  ];
  return Object.fromEntries(
    allowed.flatMap(key =>
      source[key] === undefined ? [] : [[key, source[key]]]
    )
  );
}

export const actionsRouter = router({
  catalog: protectedProcedure.query(() => getActionCatalog()),

  audit: protectedProcedure
    .input(
      z
        .object({ limit: z.number().int().min(1).max(100).optional() })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const events = await getUserOrchestrationEvents(
        ctx.user.id,
        input?.limit || 50
      );
      return events
        .filter(event => isCapabilityEvent(event.event_type))
        .map(event => ({
          id: event.id,
          projectId: event.project_id,
          eventType: event.event_type,
          agentName: event.agent_name,
          summary: event.summary,
          payload: safePayload(event.payload),
          createdAt: event.created_at,
        }));
    }),
});
