/**
 * Session Health Indicator & Stabilization Button
 * 
 * Shows session health state as a subtle pill in the workspace.
 * When health degrades, offers a manual "Stabilize" button.
 * During stabilization, shows progress phases.
 * On completion, shows a brief success state.
 */
import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useConversationStore } from "@/stores";

type HealthState = "stable" | "elevated" | "high_pressure" | "stabilization_recommended";
type StabilizationPhase = "idle" | "snapshot" | "compressing" | "discarding" | "rebuilding" | "complete" | "failed";

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

export function SessionHealthIndicator() {
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [stabilizing, setStabilizing] = useState(false);
  const [phase, setPhase] = useState<StabilizationPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [phaseMessage, setPhaseMessage] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const conversationId = useConversationStore((s) => s.activeConversationId);

  // Poll session health every 30 seconds
  const healthQuery = trpc.sessionHealth.getHealth.useQuery(
    { conversationId: conversationId || "" },
    { 
      enabled: !!conversationId,
      refetchInterval: 30000,
      refetchOnWindowFocus: false,
    }
  );

  useEffect(() => {
    if (healthQuery.data) {
      setHealth(healthQuery.data as HealthReport);
    }
  }, [healthQuery.data]);

  const stabilizeMutation = trpc.sessionHealth.stabilize.useMutation({
    onSuccess: (data: any) => {
      setStabilizing(false);
      setPhase("complete");
      setProgress(100);
      setPhaseMessage("Session stabilized successfully.");
      setShowSuccess(true);
      // Refresh health after stabilization
      healthQuery.refetch();
      // Auto-hide success after 3 seconds
      setTimeout(() => {
        setShowSuccess(false);
        setPhase("idle");
        setProgress(0);
      }, 3000);
    },
    onError: () => {
      setStabilizing(false);
      setPhase("failed");
      setPhaseMessage("Stabilization failed. Session continues normally.");
      setTimeout(() => {
        setPhase("idle");
        setProgress(0);
      }, 3000);
    },
  });

  const handleStabilize = useCallback(() => {
    if (!conversationId || stabilizing) return;
    setStabilizing(true);
    setPhase("snapshot");
    setProgress(10);
    setPhaseMessage("Capturing session state...");

    // Simulate progress phases while waiting for backend
    const phases: Array<{ phase: StabilizationPhase; progress: number; msg: string; delay: number }> = [
      { phase: "snapshot", progress: 15, msg: "Snapshotting conversation...", delay: 500 },
      { phase: "compressing", progress: 35, msg: "Compressing context...", delay: 1500 },
      { phase: "compressing", progress: 50, msg: "Summarizing key decisions...", delay: 2500 },
      { phase: "discarding", progress: 65, msg: "Removing noise & dead-ends...", delay: 3500 },
      { phase: "discarding", progress: 75, msg: "Cleaning stale retries...", delay: 4500 },
      { phase: "rebuilding", progress: 88, msg: "Reconstructing clean context...", delay: 5500 },
    ];

    phases.forEach(({ phase: p, progress: prog, msg, delay }) => {
      setTimeout(() => {
        if (stabilizing) {
          setPhase(p);
          setProgress(prog);
          setPhaseMessage(msg);
        }
      }, delay);
    });

    stabilizeMutation.mutate({ conversationId });
  }, [conversationId, stabilizing, stabilizeMutation]);

  // Don't render if no session or no health data
  if (!conversationId || !health) return null;

  // Don't render if session is brand new (< 5 messages)
  if (health.metrics.messageCount < 5 && health.state === "stable") return null;

  const stateConfig = getStateConfig(health.state);

  return (
    <div className="relative">
      {/* Main Pill */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`
          flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium
          transition-all duration-200 ease-out
          border backdrop-blur-sm
          ${stateConfig.pillClasses}
          ${health.state !== "stable" ? "animate-pulse-subtle" : ""}
        `}
        title={`Session Health: ${health.score}%`}
      >
        {/* Status Dot */}
        <span className={`w-1.5 h-1.5 rounded-full ${stateConfig.dotColor}`} />
        
        {/* Label */}
        <span className="opacity-80">{stateConfig.label}</span>
        
        {/* Score */}
        <span className="opacity-50 tabular-nums">{health.score}%</span>
      </button>

      {/* Expanded Panel */}
      {expanded && (
        <div className="absolute top-full mt-2 right-0 z-50 w-72 rounded-lg border border-white/5 bg-black/90 backdrop-blur-xl shadow-2xl p-3">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-white/70">Session Health</span>
            <span className={`text-xs font-mono ${stateConfig.scoreColor}`}>{health.score}/100</span>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <MetricCell label="Messages" value={String(health.metrics.messageCount)} />
            <MetricCell label="Context" value={`${Math.round(health.metrics.contextWindowUsed)}%`} />
            <MetricCell label="Repetition" value={`${Math.round(health.metrics.repetitionScore * 100)}%`} />
            <MetricCell label="Loops" value={String(health.metrics.loopIndicators)} />
          </div>

          {/* Recommendations */}
          {health.recommendations.length > 0 && (
            <div className="mb-3 space-y-1">
              {health.recommendations.map((rec, i) => (
                <p key={i} className="text-[10px] text-white/40 leading-tight">{rec}</p>
              ))}
            </div>
          )}

          {/* Stabilize Button */}
          {health.canStabilize && phase === "idle" && (
            <button
              onClick={handleStabilize}
              disabled={stabilizing}
              className="w-full py-1.5 rounded-md text-xs font-medium
                bg-white/5 border border-white/10 text-white/80
                hover:bg-white/10 hover:border-white/20
                active:scale-[0.97] transition-all duration-150
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Stabilize Session
            </button>
          )}

          {/* Stabilization Progress */}
          {phase !== "idle" && phase !== "complete" && phase !== "failed" && (
            <div className="space-y-2">
              <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full rounded-full bg-white/30 transition-all duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-[10px] text-white/50 text-center">{phaseMessage}</p>
            </div>
          )}

          {/* Success State */}
          {showSuccess && (
            <div className="flex items-center justify-center gap-1.5 py-1.5">
              <span className="text-[10px] text-white/60">✓ Session stabilized</span>
            </div>
          )}

          {/* Failed State */}
          {phase === "failed" && (
            <div className="flex items-center justify-center gap-1.5 py-1.5">
              <span className="text-[10px] text-white/40">{phaseMessage}</span>
            </div>
          )}
        </div>
      )}

      {/* Stabilization Toast (bottom of screen) */}
      {showSuccess && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100]
          px-4 py-2 rounded-lg bg-black/80 border border-white/10 backdrop-blur-xl
          text-xs text-white/70 shadow-2xl
          animate-in fade-in slide-in-from-bottom-2 duration-300">
          Session stabilized successfully.
        </div>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2 py-1 rounded bg-white/[0.02] border border-white/5">
      <div className="text-[9px] text-white/30 uppercase tracking-wider">{label}</div>
      <div className="text-xs text-white/70 font-mono">{value}</div>
    </div>
  );
}

function getStateConfig(state: HealthState) {
  switch (state) {
    case "stable":
      return {
        label: "Stable",
        pillClasses: "border-white/5 bg-white/[0.02] text-white/60 hover:bg-white/[0.04]",
        dotColor: "bg-white/30",
        scoreColor: "text-white/50",
      };
    case "elevated":
      return {
        label: "Elevated",
        pillClasses: "border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.05]",
        dotColor: "bg-yellow-500/50",
        scoreColor: "text-yellow-500/60",
      };
    case "high_pressure":
      return {
        label: "High Load",
        pillClasses: "border-white/10 bg-white/[0.04] text-white/80 hover:bg-white/[0.06]",
        dotColor: "bg-orange-500/60",
        scoreColor: "text-orange-500/60",
      };
    case "stabilization_recommended":
      return {
        label: "Stabilize",
        pillClasses: "border-white/15 bg-white/[0.05] text-white/90 hover:bg-white/[0.08]",
        dotColor: "bg-red-500/60 animate-pulse",
        scoreColor: "text-red-500/60",
      };
  }
}
