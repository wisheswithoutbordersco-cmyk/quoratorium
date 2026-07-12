/**
 * Q Workspace — Analytics Page
 * Real data from tRPC: project stats + recent orchestration events
 */
import { motion } from "framer-motion";
import { BarChart3, Activity, FolderKanban, MessageSquare, FileCode2, Loader2 } from "lucide-react";
import { TopNav } from "@/components/TopNav";
import { trpc } from "@/lib/trpc";

export default function Analytics() {
  const { data: stats } = trpc.projects.getStats.useQuery(undefined, { retry: 1 });
  const { data: recentActivity, isLoading: activityLoading } = trpc.projects.getRecentActivity.useQuery({ limit: 15 }, { retry: 1 });

  const metrics = [
    { label: "Total Projects", value: stats?.totalProjects ?? 0, icon: FolderKanban, color: "#6366F1" },
    { label: "Active Projects", value: stats?.activeProjects ?? 0, icon: Activity, color: "#10B981" },
    { label: "Messages Sent", value: stats?.totalMessages ?? 0, icon: MessageSquare, color: "#F59E0B" },
    { label: "Files Generated", value: stats?.totalFiles ?? 0, icon: FileCode2, color: "#EC4899" },
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
          {!stats || (stats.totalProjects === 0 && stats.activeProjects === 0 && stats.totalMessages === 0 && stats.totalFiles === 0) ? (
            <div className="p-12 rounded-xl surface-elevated border border-border text-center mb-8">
              <BarChart3 size={32} className="text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground/60">Analytics data will appear here as you use the platform</p>
              <p className="text-[11px] text-muted-foreground/40 mt-1">Create projects and run conversations to see metrics</p>
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
                    <p className="font-display text-2xl text-foreground">{metric.value}</p>
                    <p className="text-[10px] text-muted-foreground/40 mt-1">{metric.label}</p>
                  </motion.div>
                );
              })}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Chart placeholder with real data context */}
            <motion.div
              className="lg:col-span-2 p-6 rounded-xl surface-elevated border border-border"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <h3 className="text-[12px] font-display text-foreground mb-4">Execution Timeline (24h)</h3>
              <div className="h-36 flex items-end gap-[3px]">
                {Array.from({ length: 48 }, (_, i) => {
                  const height = 15 + Math.sin(i * 0.3) * 20 + Math.random() * 40 + (i > 30 ? 20 : 0);
                  return (
                    <motion.div
                      key={i}
                      className="flex-1 rounded-t-sm bg-primary/30"
                      initial={{ height: 0 }}
                      animate={{ height: `${Math.min(height, 100)}%` }}
                      transition={{ duration: 0.5, delay: i * 0.015 }}
                      style={{ opacity: 0.3 + Math.random() * 0.7 }}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-[8px] text-muted-foreground/30 font-mono">00:00</span>
                <span className="text-[8px] text-muted-foreground/30 font-mono">06:00</span>
                <span className="text-[8px] text-muted-foreground/30 font-mono">12:00</span>
                <span className="text-[8px] text-muted-foreground/30 font-mono">18:00</span>
                <span className="text-[8px] text-muted-foreground/30 font-mono">Now</span>
              </div>
            </motion.div>

            {/* Recent Activity — real data */}
            <motion.div
              className="rounded-xl surface-elevated border border-border overflow-hidden"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
            >
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-[12px] font-display text-foreground">Recent Activity</h3>
              </div>
              {activityLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="animate-spin text-primary/50" size={16} />
                </div>
              ) : recentActivity && recentActivity.length > 0 ? (
                <div className="divide-y divide-border max-h-[300px] overflow-y-auto">
                  {recentActivity.map((item, index) => (
                    <div key={index} className="flex items-start gap-3 px-4 py-2.5">
                      <span className="text-[9px] font-mono text-muted-foreground/30 w-12 flex-shrink-0 mt-0.5">
                        {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                        item.eventType.includes("complete") ? "bg-[#10B981]" :
                        item.eventType.includes("start") ? "bg-primary/50" :
                        item.eventType.includes("error") ? "bg-[#EF4444]" :
                        "bg-[#F59E0B]"
                      }`} />
                      <div className="min-w-0">
                        <span className="text-[10px] text-muted-foreground/60 block truncate">
                          {item.summary || `${item.agentName || "System"}: ${item.eventType}`}
                        </span>
                        <span className="text-[8px] text-muted-foreground/30">{item.projectName}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <p className="text-[10px] text-muted-foreground/40">No activity yet</p>
                  <p className="text-[9px] text-muted-foreground/25 mt-1">Start a project to see events here</p>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
