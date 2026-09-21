import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useConversationStore } from "@/stores";

type HealthState =
  | "stable"
  | "elevated"
  | "high_pressure"
  | "stabilization_recommended";

interface HealthReport {
  state: HealthState;
  score: number;
  recommendations: string[];
  canStabilize: boolean;
  metrics: {
    messageCount: number;
    contextWindowUsed: number;
    repetitionScore: number;
    loopIndicators: number;
  };
}

interface StabilizationResult {
  success: boolean;
  summary: string;
  error: string | null;
  discardedCount: number;
  compressionSavedPercent: number;
  duration: number;
  originalTokens: number;
  compressedTokens: number;
}

export function SessionHealthIndicator() {
  const [expanded, setExpanded] = useState(false);
  const [result, setResult] = useState<StabilizationResult | null>(null);
  const activeConversationId = useConversationStore(
    state => state.activeConversationId
  );
  const conversationId = useMemo(() => {
    const parsed = Number(activeConversationId);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [activeConversationId]);

  const healthQuery = trpc.sessionHealth.getHealth.useQuery(
    { conversationId: conversationId ?? 0 },
    {
      enabled: conversationId !== null,
      refetchInterval: 30_000,
      refetchOnWindowFocus: false,
    }
  );
  const stabilizeMutation = trpc.sessionHealth.stabilize.useMutation({
    onSuccess: data => {
      setResult(data as StabilizationResult);
      healthQuery.refetch();
    },
    onError: error => {
      setResult({
        success: false,
        summary: "The server did not complete conversation stabilization.",
        error: error.message,
        discardedCount: 0,
        compressionSavedPercent: 0,
        duration: 0,
        originalTokens: 0,
        compressedTokens: 0,
      });
    },
  });

  useEffect(() => {
    setResult(null);
  }, [conversationId]);

  const health = healthQuery.data as HealthReport | undefined;
  if (!conversationId || !health) return null;
  if (health.metrics.messageCount < 5 && health.state === "stable") return null;

  const stateConfig = getStateConfig(health.state);
  const isSaving = stabilizeMutation.isPending;

  return (
    <div className="relative">
      <button
        onClick={() => setExpanded(value => !value)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-200 border backdrop-blur-sm ${stateConfig.pillClasses}`}
        title={`Conversation health: ${health.score}%`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${stateConfig.dotColor}`} />
        <span className="opacity-80">{stateConfig.label}</span>
        <span className="opacity-50 tabular-nums">{health.score}%</span>
      </button>

      {expanded && (
        <div className="absolute top-full mt-2 right-0 z-50 w-72 rounded-lg border border-white/5 bg-black/90 backdrop-blur-xl shadow-2xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-white/70">
              Conversation Health
            </span>
            <span className={`text-xs font-mono ${stateConfig.scoreColor}`}>
              {health.score}/100
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <MetricCell
              label="Messages"
              value={String(health.metrics.messageCount)}
            />
            <MetricCell
              label="Context"
              value={`${Math.round(health.metrics.contextWindowUsed)}%`}
            />
            <MetricCell
              label="Repetition"
              value={`${Math.round(health.metrics.repetitionScore * 100)}%`}
            />
            <MetricCell
              label="Loops"
              value={String(health.metrics.loopIndicators)}
            />
          </div>

          {health.recommendations.length > 0 && (
            <div className="mb-3 space-y-1">
              {health.recommendations.map(recommendation => (
                <p
                  key={recommendation}
                  className="text-[10px] text-white/40 leading-tight"
                >
                  {recommendation}
                </p>
              ))}
            </div>
          )}

          {result && (
            <div
              className={`mb-3 rounded-md border px-2.5 py-2 text-[10px] leading-relaxed ${result.success ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-100/70" : "border-red-500/20 bg-red-500/5 text-red-100/70"}`}
            >
              <p>
                {result.success
                  ? "Compressed context was saved for this conversation."
                  : result.error || result.summary}
              </p>
              {result.success && (
                <p className="mt-1 text-white/45">
                  Saved {result.compressionSavedPercent}% of estimated context (
                  {result.originalTokens} → {result.compressedTokens} tokens).
                </p>
              )}
            </div>
          )}

          {health.canStabilize && (
            <button
              onClick={() =>
                conversationId && stabilizeMutation.mutate({ conversationId })
              }
              disabled={isSaving}
              className="w-full py-1.5 rounded-md text-xs font-medium bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 hover:border-white/20 active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSaving
                ? "Saving compressed context…"
                : "Compress conversation context"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2 py-1 rounded bg-white/[0.02] border border-white/5">
      <div className="text-[9px] text-white/30 uppercase tracking-wider">
        {label}
      </div>
      <div className="text-xs text-white/70 font-mono">{value}</div>
    </div>
  );
}

function getStateConfig(state: HealthState) {
  switch (state) {
    case "stable":
      return {
        label: "Stable",
        pillClasses:
          "border-white/5 bg-white/[0.02] text-white/60 hover:bg-white/[0.04]",
        dotColor: "bg-white/30",
        scoreColor: "text-white/50",
      };
    case "elevated":
      return {
        label: "Elevated",
        pillClasses:
          "border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.05]",
        dotColor: "bg-yellow-500/50",
        scoreColor: "text-yellow-500/60",
      };
    case "high_pressure":
      return {
        label: "High context",
        pillClasses:
          "border-white/10 bg-white/[0.04] text-white/80 hover:bg-white/[0.06]",
        dotColor: "bg-orange-500/60",
        scoreColor: "text-orange-500/60",
      };
    case "stabilization_recommended":
      return {
        label: "Review context",
        pillClasses:
          "border-white/15 bg-white/[0.05] text-white/90 hover:bg-white/[0.08]",
        dotColor: "bg-red-500/60",
        scoreColor: "text-red-500/60",
      };
  }
}
