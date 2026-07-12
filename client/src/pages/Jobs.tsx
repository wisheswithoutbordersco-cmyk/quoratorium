/**
 * Q Workspace — Jobs Dashboard
 * Active jobs, progress, history, retry, queue stats
 */
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Layers, Play, CheckCircle2, XCircle, Clock, RotateCcw,
  Loader2, AlertTriangle, Trash2, Filter, Activity
} from "lucide-react";
import { TopNav } from "@/components/TopNav";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type StatusFilter = "all" | "queued" | "processing" | "completed" | "failed" | "dead_letter" | "cancelled";

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Play; color: string; bg: string }> = {
  queued: { label: "Queued", icon: Clock, color: "text-muted-foreground", bg: "bg-muted/30" },
  processing: { label: "Processing", icon: Loader2, color: "text-blue-400", bg: "bg-blue-500/10" },
  retrying: { label: "Retrying", icon: RotateCcw, color: "text-amber-400", bg: "bg-amber-500/10" },
  completed: { label: "Completed", icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  failed: { label: "Failed", icon: XCircle, color: "text-red-400", bg: "bg-red-500/10" },
  dead_letter: { label: "Dead Letter", icon: AlertTriangle, color: "text-red-500", bg: "bg-red-500/15" },
  cancelled: { label: "Cancelled", icon: Trash2, color: "text-muted-foreground/60", bg: "bg-muted/20" },
};

const TYPE_LABELS: Record<string, string> = {
  ai_chat: "AI Chat",
  code_generation: "Code Gen",
  code_validation: "Validation",
  research: "Research",
  image_generation: "Image Gen",
  browser_task: "Browser",
  code_execution: "Execution",
  embedding: "Embedding",
  deployment: "Deploy",
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatTime(date: Date | string | null): string {
  if (!date) return "—";
  const d = new Date(date);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function Jobs() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const { data: jobsData, isLoading, isError } = trpc.jobs.list.useQuery(
    statusFilter !== "all" ? { status: statusFilter as any } : undefined,
    { refetchInterval: 3000, retry: 1 }
  );
  const { data: stats } = trpc.jobs.stats.useQuery(undefined, { refetchInterval: 5000, retry: 1 });
  const utils = trpc.useUtils();

  const cancelJob = trpc.jobs.cancel.useMutation({
    onSuccess: () => { toast.success("Job cancelled"); utils.jobs.list.invalidate(); utils.jobs.stats.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const retryJob = trpc.jobs.retry.useMutation({
    onSuccess: () => { toast.success("Job queued for retry"); utils.jobs.list.invalidate(); utils.jobs.stats.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const jobsList = jobsData?.jobs || [];

  return (
    <div className="h-screen flex flex-col surface-base">
      <TopNav />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="font-display text-xl text-foreground tracking-tight flex items-center gap-2">
                <Layers size={18} className="text-primary/70" />
                Job Queue
              </h1>
              <p className="text-[11px] text-muted-foreground/50 mt-1">
                Async task infrastructure — track, retry, and manage AI operations
              </p>
            </div>
          </div>

          {/* Stats Cards */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
              <StatCard label="Total" value={stats.total} color="text-foreground" />
              <StatCard label="Queued" value={stats.queued} color="text-muted-foreground" />
              <StatCard label="Processing" value={stats.processing} color="text-blue-400" />
              <StatCard label="Completed" value={stats.completed} color="text-emerald-400" />
              <StatCard label="Failed" value={stats.failed} color="text-red-400" />
              <StatCard label="Success Rate" value={`${stats.successRate}%`} color="text-primary" />
            </div>
          )}

          {stats && stats.avgDurationMs > 0 && (
            <div className="flex items-center gap-4 mb-6 px-3 py-2 rounded-lg surface-elevated border border-border">
              <Activity size={14} className="text-primary/60" />
              <span className="text-[11px] text-muted-foreground/70">
                Avg duration: <span className="text-foreground font-medium">{formatDuration(stats.avgDurationMs)}</span>
              </span>
              <span className="text-[11px] text-muted-foreground/70">
                Dead letter: <span className="text-red-400 font-medium">{stats.deadLetter}</span>
              </span>
            </div>
          )}

          {/* Filter Tabs */}
          <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1">
            {(["all", "processing", "queued", "completed", "failed", "dead_letter", "cancelled"] as StatusFilter[]).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors ${
                  statusFilter === s
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/30 text-muted-foreground hover:text-foreground"
                }`}
              >
                {s === "all" ? "All" : STATUS_CONFIG[s]?.label || s}
              </button>
            ))}
          </div>

          {/* Jobs List */}
          {isLoading && !jobsData && !isError ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="animate-spin text-primary" size={24} />
            </div>
          ) : jobsList.length > 0 ? (
            <div className="space-y-2">
              {jobsList.map((job, i) => {
                const config = STATUS_CONFIG[job.status] || STATUS_CONFIG.queued;
                const Icon = config.icon;
                return (
                  <motion.div
                    key={job.id}
                    className="p-4 rounded-xl surface-elevated border border-border group hover:border-primary/20 transition-colors"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.02 }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`p-1.5 rounded-lg ${config.bg}`}>
                          <Icon size={14} className={`${config.color} ${job.status === "processing" ? "animate-spin" : ""}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-foreground">
                              {TYPE_LABELS[job.type] || job.type}
                            </span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${config.bg} ${config.color}`}>
                              {config.label}
                            </span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground/60">
                              {job.priority}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-[9px] text-muted-foreground/40 font-mono">{job.id.slice(0, 16)}</span>
                            <span className="text-[9px] text-muted-foreground/40">{formatTime(job.created_at)}</span>
                            {job.retries > 0 && (
                              <span className="text-[9px] text-amber-400">Retries: {job.retries}/{job.max_retries}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Progress bar for processing jobs */}
                      {(job.status === "processing" || job.status === "retrying") && (
                        <div className="w-24 mr-4">
                          <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
                            <motion.div
                              className="h-full rounded-full bg-primary"
                              initial={{ width: 0 }}
                              animate={{ width: `${job.progress}%` }}
                              transition={{ duration: 0.3 }}
                            />
                          </div>
                          <span className="text-[9px] text-muted-foreground/50 mt-0.5 block text-right">{job.progress}%</span>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {(job.status === "failed" || job.status === "dead_letter") && (
                          <button
                            onClick={() => retryJob.mutate({ id: job.id })}
                            className="p-1.5 rounded text-muted-foreground/40 hover:text-primary transition-colors"
                            title="Retry"
                          >
                            <RotateCcw size={12} />
                          </button>
                        )}
                        {(job.status === "queued" || job.status === "processing") && (
                          <button
                            onClick={() => cancelJob.mutate({ id: job.id })}
                            className="p-1.5 rounded text-muted-foreground/40 hover:text-destructive transition-colors"
                            title="Cancel"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Error display for failed jobs */}
                    {job.error && (job.status === "failed" || job.status === "dead_letter") && (
                      <div className="mt-2 px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/10">
                        <p className="text-[10px] text-red-400/80 font-mono line-clamp-2">{job.error}</p>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-20">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-muted/20 border border-border flex items-center justify-center">
                <Layers size={28} className="text-muted-foreground/40" />
              </div>
              <h3 className="text-sm font-medium text-foreground/80 mb-2">No jobs in queue</h3>
              <p className="text-xs text-muted-foreground/60 max-w-sm mx-auto leading-relaxed">
                Background tasks like AI chat completions, code generation, deployments, and research operations will appear here as they run. Jobs are created automatically when you interact with Captain Q.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="p-3 rounded-xl surface-elevated border border-border">
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground/60">{label}</div>
    </div>
  );
}
