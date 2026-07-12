/**
 * Q Workspace — Observability Dashboard
 * 
 * Structured logging, tracing, metrics, worker telemetry, and error aggregation.
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { TopNav } from "@/components/TopNav";
import {
  Activity, AlertTriangle, Clock, Cpu, Layers,
  RefreshCw, Search, Server, Zap, TrendingUp
} from "lucide-react";

type Tab = "overview" | "logs" | "traces" | "workers" | "errors";

export default function Observability() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [logLevel, setLogLevel] = useState<string>("info");

  const { data: summary, refetch, isLoading } = trpc.observability.summary.useQuery(undefined, {
    refetchInterval: 10000,
  });

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: "overview", label: "Overview", icon: <Activity size={14} /> },
    { id: "logs", label: "Logs", icon: <Layers size={14} /> },
    { id: "traces", label: "Traces", icon: <Zap size={14} /> },
    { id: "workers", label: "Workers", icon: <Cpu size={14} /> },
    { id: "errors", label: "Errors", icon: <AlertTriangle size={14} /> },
  ];

  return (
    <div className="h-screen flex flex-col overflow-hidden surface-base">
      <TopNav />
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Server size={18} className="text-primary" />
              Observability
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">System monitoring, logging, and telemetry</p>
          </div>
          <div className="flex items-center gap-2">
            {summary?.systemHealth && (
              <div className={`px-2.5 py-1 rounded-full text-[10px] font-medium ${
                summary.systemHealth.status === "healthy" ? "bg-emerald-500/10 text-emerald-400" :
                summary.systemHealth.status === "degraded" ? "bg-amber-500/10 text-amber-400" :
                "bg-red-500/10 text-red-400"
              }`}>
                {summary.systemHealth.status.toUpperCase()}
              </div>
            )}
            <button
              onClick={() => refetch()}
              className="p-2 rounded-md surface-elevated border border-border text-muted-foreground hover:text-primary transition-colors"
            >
              <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-4 sm:px-6 border-b border-border flex gap-1 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {activeTab === "overview" && <OverviewPanel summary={summary} />}
          {activeTab === "logs" && <LogsPanel logLevel={logLevel} setLogLevel={setLogLevel} />}
          {activeTab === "traces" && <TracesPanel />}
          {activeTab === "workers" && <WorkersPanel telemetry={summary?.workerTelemetry} />}
          {activeTab === "errors" && <ErrorsPanel errors={summary?.topErrors} />}
        </div>
      </div>
    </div>
  );
}

function OverviewPanel({ summary }: { summary: any }) {
  if (!summary) return <LoadingSkeleton />;

  const stats = [
    { label: "Total Logs", value: summary.totalLogs.toLocaleString(), icon: <Layers size={14} />, color: "text-blue-400" },
    { label: "Active Traces", value: summary.activeTraces, icon: <Zap size={14} />, color: "text-amber-400" },
    { label: "Errors", value: summary.errorCount, icon: <AlertTriangle size={14} />, color: "text-red-400" },
    { label: "Warnings", value: summary.warnCount, icon: <AlertTriangle size={14} />, color: "text-amber-400" },
    { label: "Avg Response", value: `${summary.systemHealth.avgResponseTime}ms`, icon: <Clock size={14} />, color: "text-emerald-400" },
    { label: "Error Rate", value: `${summary.systemHealth.errorRate}%`, icon: <TrendingUp size={14} />, color: "text-purple-400" },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            className="surface-elevated border border-border rounded-lg p-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <div className={`flex items-center gap-1.5 mb-1 ${stat.color}`}>
              {stat.icon}
              <span className="text-[10px] uppercase tracking-wider">{stat.label}</span>
            </div>
            <p className="text-lg font-semibold text-foreground">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Uptime */}
      <div className="surface-elevated border border-border rounded-lg p-4">
        <h3 className="text-sm font-medium text-foreground mb-2">System Health</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase">Uptime</p>
            <p className="text-sm font-mono text-foreground">{formatDuration(summary.systemHealth.uptime)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase">Total Metrics</p>
            <p className="text-sm font-mono text-foreground">{summary.totalMetrics.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase">Total Spans</p>
            <p className="text-sm font-mono text-foreground">{summary.totalSpans.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Recent Logs */}
      <div className="surface-elevated border border-border rounded-lg p-4">
        <h3 className="text-sm font-medium text-foreground mb-3">Recent Activity</h3>
        <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
          {summary.recentLogs?.length > 0 ? summary.recentLogs.slice(0, 10).map((log: any) => (
            <div key={log.id} className="flex items-start gap-2 text-xs py-1 border-b border-border/50 last:border-0">
              <LogLevelBadge level={log.level} />
              <span className="text-muted-foreground font-mono text-[10px] shrink-0">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              <span className="text-foreground/80 truncate">{log.message}</span>
              {log.worker && <span className="text-primary/50 text-[10px] shrink-0">[{log.worker}]</span>}
            </div>
          )) : (
            <p className="text-xs text-muted-foreground/50">No recent logs</p>
          )}
        </div>
      </div>
    </div>
  );
}

function LogsPanel({ logLevel, setLogLevel }: { logLevel: string; setLogLevel: (l: string) => void }) {
  const [search, setSearch] = useState("");
  const { data: logs } = trpc.observability.logs.useQuery(
    { level: logLevel as any, limit: 100 },
    { refetchInterval: 5000 }
  );

  const filteredLogs = logs?.filter(l => 
    !search || l.message.toLowerCase().includes(search.toLowerCase()) || l.worker?.toLowerCase().includes(search.toLowerCase())
  ) || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search logs..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-transparent border border-border rounded-md text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/30"
          />
        </div>
        <select
          value={logLevel}
          onChange={e => setLogLevel(e.target.value)}
          className="px-3 py-2 text-sm bg-transparent border border-border rounded-md text-foreground focus:outline-none focus:border-primary/30"
        >
          <option value="debug">Debug+</option>
          <option value="info">Info+</option>
          <option value="warn">Warn+</option>
          <option value="error">Error+</option>
          <option value="fatal">Fatal</option>
        </select>
      </div>

      <div className="surface-elevated border border-border rounded-lg overflow-hidden">
        <div className="max-h-[500px] overflow-y-auto">
          {filteredLogs.length > 0 ? filteredLogs.map(log => (
            <div key={log.id} className="flex items-start gap-2 px-3 py-2 border-b border-border/30 text-xs hover:bg-white/[0.02]">
              <LogLevelBadge level={log.level} />
              <span className="text-muted-foreground font-mono text-[10px] shrink-0 w-[70px]">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              <span className="text-foreground/80 flex-1 break-all">{log.message}</span>
              {log.worker && <span className="text-primary/40 text-[10px] shrink-0">{log.worker}</span>}
              {log.service && <span className="text-muted-foreground/40 text-[10px] shrink-0">{log.service}</span>}
            </div>
          )) : (
            <div className="p-8 text-center text-xs text-muted-foreground/50">No logs found</div>
          )}
        </div>
      </div>
    </div>
  );
}

function TracesPanel() {
  const { data: traces } = trpc.observability.traces.useQuery(
    { limit: 50 },
    { refetchInterval: 5000 }
  );

  return (
    <div className="space-y-4">
      <div className="surface-elevated border border-border rounded-lg overflow-hidden">
        <div className="max-h-[500px] overflow-y-auto">
          {traces && traces.length > 0 ? traces.map(span => (
            <div key={span.spanId} className="flex items-center gap-3 px-3 py-2.5 border-b border-border/30 text-xs hover:bg-white/[0.02]">
              <div className={`w-2 h-2 rounded-full ${
                span.status === "running" ? "bg-amber-400 animate-pulse" :
                span.status === "completed" ? "bg-emerald-400" : "bg-red-400"
              }`} />
              <span className="font-medium text-foreground/80 flex-1 truncate">{span.name}</span>
              {span.worker && <span className="text-primary/50 text-[10px]">{span.worker}</span>}
              <span className="text-muted-foreground font-mono text-[10px]">
                {span.durationMs ? `${span.durationMs}ms` : "running..."}
              </span>
              <span className="text-muted-foreground/40 font-mono text-[10px]">
                {new Date(span.startTime).toLocaleTimeString()}
              </span>
            </div>
          )) : (
            <div className="p-8 text-center text-xs text-muted-foreground/50">No traces recorded</div>
          )}
        </div>
      </div>
    </div>
  );
}

function WorkersPanel({ telemetry }: { telemetry: any[] | undefined }) {
  if (!telemetry || telemetry.length === 0) {
    return <div className="p-8 text-center text-xs text-muted-foreground/50">No worker telemetry data yet</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {telemetry.map(worker => (
          <motion.div
            key={worker.worker}
            className="surface-elevated border border-border rounded-lg p-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-foreground">{worker.worker}</h4>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                worker.errorRate < 5 ? "bg-emerald-500/10 text-emerald-400" :
                worker.errorRate < 20 ? "bg-amber-500/10 text-amber-400" :
                "bg-red-500/10 text-red-400"
              }`}>
                {worker.errorRate}% error
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-muted-foreground/60">Total Calls</p>
                <p className="font-mono text-foreground">{worker.totalCalls}</p>
              </div>
              <div>
                <p className="text-muted-foreground/60">Avg Duration</p>
                <p className="font-mono text-foreground">{worker.avgDurationMs}ms</p>
              </div>
              <div>
                <p className="text-muted-foreground/60">P95 Duration</p>
                <p className="font-mono text-foreground">{worker.p95DurationMs}ms</p>
              </div>
              <div>
                <p className="text-muted-foreground/60">Avg Tokens</p>
                <p className="font-mono text-foreground">{worker.avgTokensPerCall}</p>
              </div>
              <div>
                <p className="text-muted-foreground/60">Success</p>
                <p className="font-mono text-emerald-400">{worker.successCalls}</p>
              </div>
              <div>
                <p className="text-muted-foreground/60">Failed</p>
                <p className="font-mono text-red-400">{worker.failedCalls}</p>
              </div>
            </div>
            {/* Success rate bar */}
            <div className="mt-3">
              <div className="h-1.5 rounded-full bg-border overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${worker.totalCalls > 0 ? (worker.successCalls / worker.totalCalls) * 100 : 0}%` }}
                />
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function ErrorsPanel({ errors }: { errors: any[] | undefined }) {
  if (!errors || errors.length === 0) {
    return <div className="p-8 text-center text-xs text-muted-foreground/50">No errors recorded — system healthy</div>;
  }

  return (
    <div className="space-y-3">
      {errors.map(err => (
        <div key={err.errorKey} className="surface-elevated border border-border rounded-lg p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground font-medium truncate">{err.message}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-muted-foreground">{err.service}</span>
                {err.worker && <span className="text-[10px] text-primary/50">{err.worker}</span>}
                <span className="text-[10px] text-muted-foreground">
                  First: {new Date(err.firstSeen).toLocaleString()}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="bg-red-500/10 text-red-400 text-[10px] px-2 py-0.5 rounded-full font-mono">
                ×{err.count}
              </span>
            </div>
          </div>
          {err.stack && (
            <pre className="mt-2 text-[10px] text-muted-foreground/60 font-mono overflow-x-auto max-h-[60px] overflow-y-hidden">
              {err.stack.split("\n").slice(0, 3).join("\n")}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}

function LogLevelBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    debug: "bg-gray-500/10 text-gray-400",
    info: "bg-blue-500/10 text-blue-400",
    warn: "bg-amber-500/10 text-amber-400",
    error: "bg-red-500/10 text-red-400",
    fatal: "bg-red-500/20 text-red-300",
  };
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono uppercase shrink-0 ${colors[level] || colors.info}`}>
      {level.slice(0, 3)}
    </span>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-24 rounded-lg bg-white/[0.02] animate-pulse" />
      ))}
    </div>
  );
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
