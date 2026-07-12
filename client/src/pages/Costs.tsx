/**
 * Q Workspace — AI Cost Governance Dashboard
 * Spend breakdown, trend chart, budget utilization, projections
 */
import { useState } from "react";
import { motion } from "framer-motion";
import {
  DollarSign, TrendingUp, AlertTriangle, BarChart3,
  Loader2, Shield, Zap, Save, PieChart
} from "lucide-react";
import { TopNav } from "@/components/TopNav";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

const MODEL_COLORS: Record<string, string> = {
  "gpt-4o": "bg-emerald-500",
  "gpt-4o-mini": "bg-emerald-300",
  "claude-sonnet-4-20250514": "bg-purple-500",
  "claude-3.5-sonnet": "bg-purple-500",
  "sonar": "bg-blue-500",
  "sonar-pro": "bg-blue-400",
  "dall-e-3": "bg-amber-500",
  "default": "bg-muted-foreground",
};

export default function Costs() {
  const { data: summary } = trpc.costs.summary.useQuery(undefined, { refetchInterval: 10000, retry: 1 });
  const { data: budget } = trpc.costs.budget.useQuery(undefined, { refetchInterval: 10000, retry: 1 });
  const { data: history } = trpc.costs.history.useQuery({ days: 30 }, { retry: 1 });
  const { data: breakdown } = trpc.costs.breakdown.useQuery(undefined, { retry: 1 });

  const [editingBudget, setEditingBudget] = useState(false);
  const [dailyLimit, setDailyLimit] = useState("");
  const [monthlyLimit, setMonthlyLimit] = useState("");

  const updateBudget = trpc.costs.updateBudget.useMutation({
    onSuccess: () => {
      toast.success("Budget updated");
      setEditingBudget(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSaveBudget = () => {
    updateBudget.mutate({
      dailyLimit: dailyLimit || undefined,
      monthlyLimit: monthlyLimit || undefined,
    });
  };

  // Don't show full-page loading spinner — render the page immediately with $0 values

  return (
    <div className="h-screen flex flex-col surface-base">
      <TopNav />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="font-display text-xl text-foreground tracking-tight flex items-center gap-2">
                <DollarSign size={18} className="text-primary/70" />
                AI Cost Governance
              </h1>
              <p className="text-[11px] text-muted-foreground/50 mt-1">
                Track spending, enforce budgets, and optimize model routing
              </p>
            </div>
          </div>

          {/* Spend Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <motion.div className="p-4 rounded-xl surface-elevated border border-border" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <div className="flex items-center gap-2 mb-1">
                <Zap size={12} className="text-amber-400" />
                <span className="text-[10px] text-muted-foreground/60">Today</span>
              </div>
              <div className="text-xl font-bold text-foreground">{formatCost(summary?.todaySpend || 0)}</div>
            </motion.div>
            <motion.div className="p-4 rounded-xl surface-elevated border border-border" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 size={12} className="text-blue-400" />
                <span className="text-[10px] text-muted-foreground/60">This Month</span>
              </div>
              <div className="text-xl font-bold text-foreground">{formatCost(summary?.monthSpend || 0)}</div>
            </motion.div>
            <motion.div className="p-4 rounded-xl surface-elevated border border-border" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={12} className="text-purple-400" />
                <span className="text-[10px] text-muted-foreground/60">Projected Monthly</span>
              </div>
              <div className="text-xl font-bold text-foreground">{formatCost(summary?.projectedMonthly || 0)}</div>
            </motion.div>
            <motion.div className="p-4 rounded-xl surface-elevated border border-border" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <div className="flex items-center gap-2 mb-1">
                <DollarSign size={12} className="text-emerald-400" />
                <span className="text-[10px] text-muted-foreground/60">All Time</span>
              </div>
              <div className="text-xl font-bold text-foreground">{formatCost(summary?.totalSpend || 0)}</div>
            </motion.div>
          </div>

          {/* Budget Utilization — show fallback when budget data is loading */}
          {(budget || true) && (
            <div className="p-4 rounded-xl surface-elevated border border-border mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Shield size={14} className="text-primary/60" />
                  Budget Utilization
                </h2>
                <button
                  onClick={() => {
                    setEditingBudget(!editingBudget);
                    setDailyLimit((budget?.daily.limit ?? 10).toString());
                    setMonthlyLimit((budget?.monthly.limit ?? 100).toString());
                  }}
                  className="text-[10px] text-primary hover:text-primary/80 transition-colors"
                >
                  {editingBudget ? "Cancel" : "Edit Limits"}
                </button>
              </div>

              {editingBudget ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <label className="text-[10px] text-muted-foreground/60 w-20">Daily ($)</label>
                    <input
                      type="number"
                      value={dailyLimit}
                      onChange={(e) => setDailyLimit(e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded-lg bg-background border border-border text-sm text-foreground outline-none focus:border-primary/50"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-[10px] text-muted-foreground/60 w-20">Monthly ($)</label>
                    <input
                      type="number"
                      value={monthlyLimit}
                      onChange={(e) => setMonthlyLimit(e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded-lg bg-background border border-border text-sm text-foreground outline-none focus:border-primary/50"
                    />
                  </div>
                  <button
                    onClick={handleSaveBudget}
                    disabled={updateBudget.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-medium disabled:opacity-50"
                  >
                    <Save size={11} /> Save
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Daily Budget Bar */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] text-muted-foreground/60">Daily</span>
                      <span className="text-[10px] text-muted-foreground/60">
                        {formatCost(budget?.daily.spent ?? 0)} / {formatCost(budget?.daily.limit ?? 10)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
                      <motion.div
                        className={`h-full rounded-full ${(budget?.daily.percentage ?? 0) >= 100 ? "bg-red-500" : (budget?.daily.percentage ?? 0) >= 80 ? "bg-amber-500" : "bg-primary"}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, budget?.daily.percentage ?? 0)}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                  </div>
                  {/* Monthly Budget Bar */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] text-muted-foreground/60">Monthly</span>
                      <span className="text-[10px] text-muted-foreground/60">
                        {formatCost(budget?.monthly.spent ?? 0)} / {formatCost(budget?.monthly.limit ?? 100)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
                      <motion.div
                        className={`h-full rounded-full ${(budget?.monthly.percentage ?? 0) >= 100 ? "bg-red-500" : (budget?.monthly.percentage ?? 0) >= 80 ? "bg-amber-500" : "bg-primary"}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, budget?.monthly.percentage ?? 0)}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Alerts */}
              {(budget?.alerts?.length ?? 0) > 0 && (
                <div className="mt-4 space-y-1.5">
                  {(budget?.alerts ?? []).slice(0, 5).map((alert, i) => (
                    <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-amber-500/5 border border-amber-500/10">
                      <AlertTriangle size={10} className="text-amber-400" />
                      <span className="text-[10px] text-amber-300/80">{alert.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Cost Trend Chart (simple bar chart) */}
          {history && history.length > 0 && (
            <div className="p-4 rounded-xl surface-elevated border border-border mb-6">
              <h2 className="text-sm font-medium text-foreground flex items-center gap-2 mb-4">
                <TrendingUp size={14} className="text-primary/60" />
                Daily Spend (Last 30 Days)
              </h2>
              <div className="flex items-end gap-1 h-32">
                {history.slice(-30).map((day, i) => {
                  const maxCost = Math.max(...history.map(d => d.cost), 0.01);
                  const height = Math.max(2, (day.cost / maxCost) * 100);
                  return (
                    <div key={day.date} className="flex-1 flex flex-col items-center justify-end group relative">
                      <div className="absolute -top-6 hidden group-hover:block z-10 px-2 py-1 rounded bg-popover border border-border text-[9px] text-foreground whitespace-nowrap">
                        {day.date}: {formatCost(day.cost)} ({day.calls} calls)
                      </div>
                      <motion.div
                        className="w-full rounded-t bg-primary/60 hover:bg-primary transition-colors"
                        initial={{ height: 0 }}
                        animate={{ height: `${height}%` }}
                        transition={{ delay: i * 0.02, duration: 0.3 }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-[9px] text-muted-foreground/40">{history[0]?.date}</span>
                <span className="text-[9px] text-muted-foreground/40">{history[history.length - 1]?.date}</span>
              </div>
            </div>
          )}

          {/* Model Breakdown */}
          {breakdown && Object.keys(breakdown.byModel).length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              {/* By Model */}
              <div className="p-4 rounded-xl surface-elevated border border-border">
                <h2 className="text-sm font-medium text-foreground flex items-center gap-2 mb-3">
                  <PieChart size={14} className="text-primary/60" />
                  Cost by Model
                </h2>
                <div className="space-y-2">
                  {Object.entries(breakdown.byModel)
                    .sort(([, a], [, b]) => b.cost - a.cost)
                    .map(([model, data]) => {
                      const totalCost = Object.values(breakdown.byModel).reduce((s, d) => s + d.cost, 0);
                      const pct = totalCost > 0 ? (data.cost / totalCost) * 100 : 0;
                      const colorClass = MODEL_COLORS[model] || MODEL_COLORS["default"];
                      return (
                        <div key={model} className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${colorClass}`} />
                          <span className="text-[11px] text-foreground flex-1 truncate">{model}</span>
                          <span className="text-[10px] text-muted-foreground/60">{data.calls} calls</span>
                          <span className="text-[11px] text-foreground font-medium w-16 text-right">{formatCost(data.cost)}</span>
                          <div className="w-16 h-1.5 rounded-full bg-muted/30 overflow-hidden">
                            <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* By Worker */}
              <div className="p-4 rounded-xl surface-elevated border border-border">
                <h2 className="text-sm font-medium text-foreground flex items-center gap-2 mb-3">
                  <BarChart3 size={14} className="text-primary/60" />
                  Cost by Worker
                </h2>
                <div className="space-y-2">
                  {Object.entries(breakdown.byWorker)
                    .sort(([, a], [, b]) => b.cost - a.cost)
                    .map(([worker, data]) => {
                      const totalCost = Object.values(breakdown.byWorker).reduce((s, d) => s + d.cost, 0);
                      const pct = totalCost > 0 ? (data.cost / totalCost) * 100 : 0;
                      return (
                        <div key={worker} className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full bg-primary/60" />
                          <span className="text-[11px] text-foreground flex-1 truncate capitalize">{worker}</span>
                          <span className="text-[10px] text-muted-foreground/60">{data.calls} calls</span>
                          <span className="text-[11px] text-foreground font-medium w-16 text-right">{formatCost(data.cost)}</span>
                          <div className="w-16 h-1.5 rounded-full bg-muted/30 overflow-hidden">
                            <div className="h-full rounded-full bg-primary/60" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          )}

          {/* Top Expensive Operations */}
          {breakdown && breakdown.topExpensive.length > 0 && (
            <div className="p-4 rounded-xl surface-elevated border border-border mb-6">
              <h2 className="text-sm font-medium text-foreground flex items-center gap-2 mb-3">
                <AlertTriangle size={14} className="text-amber-400/60" />
                Top Expensive Operations
              </h2>
              <div className="space-y-1.5">
                {breakdown.topExpensive.slice(0, 8).map((op, i) => (
                  <div key={i} className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-muted/10 transition-colors">
                    <span className="text-[10px] text-muted-foreground/40 w-4">{i + 1}</span>
                    <span className="text-[11px] text-foreground flex-1">{op.model}</span>
                    <span className="text-[10px] text-muted-foreground/60 capitalize">{op.worker}</span>
                    <span className="text-[11px] text-foreground font-medium">{formatCost(op.cost)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state — show when no history or breakdown data */}
          {(!history || history.length === 0) && (!breakdown || Object.keys(breakdown.byModel).length === 0) && (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-muted/20 border border-border flex items-center justify-center">
                <DollarSign size={28} className="text-muted-foreground/40" />
              </div>
              <h3 className="text-sm font-medium text-foreground/80 mb-2">Cost tracking begins when you start using AI models</h3>
              <p className="text-xs text-muted-foreground/60 max-w-sm mx-auto leading-relaxed">
                Every AI interaction (chat, code generation, research, image creation) is tracked here with per-model cost breakdowns, daily trends, and budget enforcement.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
