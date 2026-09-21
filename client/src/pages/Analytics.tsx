/**
 * Q Workspace — Analytics Page
 * Real data from tRPC: project stats + recent orchestration events
 */
import { motion } from "framer-motion";
import {
  BarChart3,
  Activity,
  FolderKanban,
  MessageSquare,
  FileCode2,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { TopNav } from "@/components/TopNav";
import { trpc } from "@/lib/trpc";

export default function Analytics() {
  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
  } = trpc.projects.getStats.useQuery(undefined, { retry: 1 });
  const { data: recentActivity, isLoading: activityLoading } =
    trpc.projects.getRecentActivity.useQuery({ limit: 15 }, { retry: 1 });
  const {
    data: timeline,
    isLoading: timelineLoading,
    isError: timelineError,
  } = trpc.observability.executionTimeline.useQuery(
    { hours: 24, buckets: 48 },
    { retry: 1 }
  );

  const metrics = [
    {
      label: "Total Projects",
      value: stats?.totalProjects ?? 0,
      icon: FolderKanban,
      color: "#6366F1",
    },
    {
      label: "Active Projects",
      value: stats?.activeProjects ?? 0,
      icon: Activity,
      color: "#10B981",
    },
    {
      label: "Messages Sent",
      value: stats?.totalMessages ?? 0,
      icon: MessageSquare,
      color: "#F59E0B",
    },
    {
      label: "Files Generated",
      value: stats?.totalFiles ?? 0,
      icon: FileCode2,
      color: "#EC4899",
    },
  ];

  return (
    <div className="h-screen flex flex-col surface-base">
      <TopNav />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="mb-8">
            <h1 className="font-display text-xl text-foreground tracking-tight flex items-center gap-2">
              <BarChart3 size={18} className="text-primary/70" />
              Analytics
            </h1>
            <p className="text-[11px] text-muted-foreground/50 mt-1">
              Platform performance and execution metrics
            </p>
          </div>

          {/* Metric Cards */}
          {statsLoading ? (
            <div className="p-12 rounded-xl surface-elevated border border-border text-center mb-8">
              <Loader2
                size={24}
                className="animate-spin text-primary/50 mx-auto"
              />
              <p className="text-sm text-muted-foreground/60 mt-3">
                Loading analytics…
              </p>
            </div>
          ) : statsError || !stats ? (
            <div className="p-12 rounded-xl surface-elevated border border-border text-center mb-8">
              <AlertTriangle
                size={28}
                className="text-amber-400/70 mx-auto mb-3"
              />
              <p className="text-sm text-muted-foreground/70">
                Analytics summary is unavailable
              </p>
              <p className="text-[11px] text-muted-foreground/40 mt-1">
                Try again when the workspace data service is available.
              </p>
            </div>
          ) : stats.totalProjects === 0 &&
            stats.activeProjects === 0 &&
            stats.totalMessages === 0 &&
            stats.totalFiles === 0 ? (
            <div className="p-12 rounded-xl surface-elevated border border-border text-center mb-8">
              <BarChart3
                size={32}
                className="text-muted-foreground/20 mx-auto mb-3"
              />
              <p className="text-sm text-muted-foreground/60">
                Analytics data will appear here as you use the platform
              </p>
              <p className="text-[11px] text-muted-foreground/40 mt-1">
                Create projects and run conversations to see metrics
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
              {metrics.map((metric, index) => {
                const Icon = metric.icon;
                return (
                  <motion.div
                    key={metric.label}
                    className="p-4 rounded-xl surface-elevated border border-border"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <Icon size={14} style={{ color: metric.color }} />
                    </div>
                    <p className="font-display text-2xl text-foreground">
                      {metric.value}
                    </p>
                    <p className="text-[10px] text-muted-foreground/40 mt-1">
                      {metric.label}
                    </p>
                  </motion.div>
                );
              })}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Persisted, user-scoped execution activity */}
            <motion.div
              className="lg:col-span-2 p-6 rounded-xl surface-elevated border border-border"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="text-[12px] font-display text-foreground">
                  Execution Timeline (24h)
                </h3>
                {timeline && (
                  <span className="text-[9px] text-muted-foreground/40">
                    {timeline.totalActivity} persisted activities
                  </span>
                )}
              </div>
              {timelineLoading ? (
                <div className="h-36 flex items-center justify-center">
                  <Loader2 className="animate-spin text-primary/50" size={18} />
                </div>
              ) : timelineError || !timeline ? (
                <div className="h-36 flex flex-col items-center justify-center text-center">
                  <AlertTriangle size={18} className="text-amber-400/70 mb-2" />
                  <p className="text-[10px] text-muted-foreground/60">
                    Persisted execution data is unavailable
                  </p>
                  <p className="text-[9px] text-muted-foreground/35 mt-1">
                    No estimated or generated activity is shown.
                  </p>
                </div>
              ) : timeline.totalActivity === 0 ? (
                <div className="h-36 flex flex-col items-center justify-center text-center">
                  <Activity
                    size={20}
                    className="text-muted-foreground/25 mb-2"
                  />
                  <p className="text-[10px] text-muted-foreground/60">
                    No persisted execution activity in the last 24 hours
                  </p>
                  <p className="text-[9px] text-muted-foreground/35 mt-1">
                    Orchestration events, jobs, and API calls appear here when
                    recorded.
                  </p>
                </div>
              ) : (
                <>
                  <div
                    className="h-36 flex items-end gap-[3px]"
                    aria-label="Persisted execution activity over the last 24 hours"
                  >
                    {timeline.buckets.map((bucket, index) => {
                      const maxTotal = Math.max(
                        ...timeline.buckets.map(item => item.total),
                        1
                      );
                      const height = Math.max(
                        2,
                        (bucket.total / maxTotal) * 100
                      );
                      return (
                        <motion.div
                          key={bucket.startAt}
                          title={`${new Date(bucket.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}: ${bucket.total} activity records`}
                          className="flex-1 rounded-t-sm bg-primary/60 hover:bg-primary transition-colors"
                          initial={{ height: 0 }}
                          animate={{ height: `${height}%` }}
                          transition={{ duration: 0.35, delay: index * 0.01 }}
                        />
                      );
                    })}
                  </div>
                  <div className="flex justify-between mt-2">
                    <span className="text-[8px] text-muted-foreground/30 font-mono">
                      24h ago
                    </span>
                    <span className="text-[8px] text-muted-foreground/30 font-mono">
                      12h ago
                    </span>
                    <span className="text-[8px] text-muted-foreground/30 font-mono">
                      Now
                    </span>
                  </div>
                  {timeline.truncated && (
                    <p className="text-[8px] text-muted-foreground/35 mt-2">
                      High-volume activity is capped per source for this view.
                    </p>
                  )}
                </>
              )}
            </motion.div>

            {/* Recent Activity — real data */}
            <motion.div
              className="rounded-xl surface-elevated border border-border overflow-hidden"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
            >
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-[12px] font-display text-foreground">
                  Recent Activity
                </h3>
              </div>
              {activityLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="animate-spin text-primary/50" size={16} />
                </div>
              ) : recentActivity && recentActivity.length > 0 ? (
                <div className="divide-y divide-border max-h-[300px] overflow-y-auto">
                  {recentActivity.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 px-4 py-2.5"
                    >
                      <span className="text-[9px] font-mono text-muted-foreground/30 w-12 flex-shrink-0 mt-0.5">
                        {new Date(item.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <div
                        className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                          item.eventType.includes("complete")
                            ? "bg-[#10B981]"
                            : item.eventType.includes("start")
                              ? "bg-primary/50"
                              : item.eventType.includes("error")
                                ? "bg-[#EF4444]"
                                : "bg-[#F59E0B]"
                        }`}
                      />
                      <div className="min-w-0">
                        <span className="text-[10px] text-muted-foreground/60 block truncate">
                          {item.summary ||
                            `${item.agentName || "System"}: ${item.eventType}`}
                        </span>
                        <span className="text-[8px] text-muted-foreground/30">
                          {item.projectName}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <p className="text-[10px] text-muted-foreground/40">
                    No activity yet
                  </p>
                  <p className="text-[9px] text-muted-foreground/25 mt-1">
                    Start a project to see events here
                  </p>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
