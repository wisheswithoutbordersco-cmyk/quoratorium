/**
 * Q Workspace — AI Cost Governance Service (Supabase)
 * 
 * Tracks spending, enforces budgets, and provides cost analytics.
 */
import { getSupabaseAdmin } from "./supabase";

function getDb() {
  return getSupabaseAdmin();
}

// ─── Model Pricing (per 1M tokens) ───────────────────────────────────────────

export const MODEL_PRICING: Record<string, { input: number; output: number; perImage?: number }> = {
  "gpt-4o": { input: 2.50, output: 10.00 },
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  "claude-3-5-sonnet": { input: 3.00, output: 15.00 },
  "claude-3.5-sonnet": { input: 3.00, output: 15.00 },
  "claude-sonnet-4-20250514": { input: 3.00, output: 15.00 },
  "sonar": { input: 1.00, output: 1.00 },
  "sonar-pro": { input: 1.00, output: 1.00 },
  "dall-e-3": { input: 0, output: 0, perImage: 0.04 },
  "dall-e-3-hd": { input: 0, output: 0, perImage: 0.08 },
  "gemini-2.5-flash": { input: 0.15, output: 0.60 },
  "default": { input: 1.00, output: 2.00 },
};

// ─── Cost Calculation ─────────────────────────────────────────────────────────

export function calculateCost(model: string, inputTokens: number, outputTokens: number, imageCount?: number): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING["default"];
  if (pricing.perImage && imageCount) {
    return pricing.perImage * imageCount;
  }
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
}

// ─── API Call Logging ─────────────────────────────────────────────────────────

export interface LogApiCallParams {
  userId: number;
  model: string;
  worker: string;
  inputTokens: number;
  outputTokens: number;
  jobId?: string;
  projectId?: number;
  durationMs?: number;
  success?: boolean;
  imageCount?: number;
}

export async function logApiCall(params: LogApiCallParams): Promise<{ cost: number; budgetWarning?: string }> {
  const db = getDb();
  if (!db) return { cost: 0 };

  const cost = calculateCost(params.model, params.inputTokens, params.outputTokens, params.imageCount);

  await db.from("api_calls").insert({
    user_id: params.userId,
    model: params.model,
    worker: params.worker,
    input_tokens: params.inputTokens,
    output_tokens: params.outputTokens,
    cost_usd: cost.toFixed(6),
    job_id: params.jobId || null,
    project_id: params.projectId || null,
    duration_ms: params.durationMs || null,
    success: params.success !== false ? 1 : 0,
  });

  const budgetWarning = await checkBudgetAfterCall(params.userId, cost);
  return { cost, budgetWarning };
}

// ─── Budget Management ────────────────────────────────────────────────────────

interface BudgetRow {
  id: number;
  user_id: number;
  type: string;
  limit_usd: string;
  current_spend: string;
  reset_at: string;
}

export async function ensureBudgets(userId: number): Promise<{ daily: BudgetRow; monthly: BudgetRow }> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  const { data: existing } = await db.from("budgets").select("*").eq("user_id", userId);
  let daily = (existing || []).find((b: any) => b.type === "daily") as BudgetRow | undefined;
  let monthly = (existing || []).find((b: any) => b.type === "monthly") as BudgetRow | undefined;

  const now = new Date();

  if (!daily) {
    const resetAt = new Date(now);
    resetAt.setHours(23, 59, 59, 999);
    const { data: row } = await db.from("budgets").insert({
      user_id: userId,
      type: "daily",
      limit_usd: "10.00",
      current_spend: "0",
      reset_at: resetAt.toISOString(),
    }).select().single();
    daily = row!;
  }

  if (!monthly) {
    const resetAt = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const { data: row } = await db.from("budgets").insert({
      user_id: userId,
      type: "monthly",
      limit_usd: "100.00",
      current_spend: "0",
      reset_at: resetAt.toISOString(),
    }).select().single();
    monthly = row!;
  }

  // Check if budgets need reset
  if (daily && new Date(daily.reset_at) < now) {
    const resetAt = new Date(now);
    resetAt.setHours(23, 59, 59, 999);
    await db.from("budgets").update({ current_spend: "0", reset_at: resetAt.toISOString() }).eq("id", daily.id);
    daily = { ...daily, current_spend: "0", reset_at: resetAt.toISOString() };
  }

  if (monthly && new Date(monthly.reset_at) < now) {
    const resetAt = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    await db.from("budgets").update({ current_spend: "0", reset_at: resetAt.toISOString() }).eq("id", monthly.id);
    monthly = { ...monthly, current_spend: "0", reset_at: resetAt.toISOString() };
  }

  return { daily: daily!, monthly: monthly! };
}

export async function updateBudgetLimits(
  userId: number,
  limits: { dailyLimit?: string; monthlyLimit?: string }
): Promise<void> {
  const db = getDb();
  if (!db) return;

  const { daily, monthly } = await ensureBudgets(userId);

  if (limits.dailyLimit) {
    await db.from("budgets").update({ limit_usd: limits.dailyLimit }).eq("id", daily.id);
  }
  if (limits.monthlyLimit) {
    await db.from("budgets").update({ limit_usd: limits.monthlyLimit }).eq("id", monthly.id);
  }
}

async function checkBudgetAfterCall(userId: number, cost: number): Promise<string | undefined> {
  const db = getDb();
  if (!db) return undefined;

  const { daily, monthly } = await ensureBudgets(userId);

  const newDailySpend = parseFloat(daily.current_spend) + cost;
  const newMonthlySpend = parseFloat(monthly.current_spend) + cost;

  await db.from("budgets").update({ current_spend: newDailySpend.toFixed(6) }).eq("id", daily.id);
  await db.from("budgets").update({ current_spend: newMonthlySpend.toFixed(6) }).eq("id", monthly.id);

  const dailyLimit = parseFloat(daily.limit_usd);
  const monthlyLimit = parseFloat(monthly.limit_usd);

  if (newDailySpend >= dailyLimit) {
    await createAlert(userId, "hard_stop", `Daily budget exceeded: $${newDailySpend.toFixed(2)} / $${dailyLimit.toFixed(2)}`, dailyLimit.toString());
    return "HARD_STOP_DAILY";
  }
  if (newMonthlySpend >= monthlyLimit) {
    await createAlert(userId, "hard_stop", `Monthly budget exceeded: $${newMonthlySpend.toFixed(2)} / $${monthlyLimit.toFixed(2)}`, monthlyLimit.toString());
    return "HARD_STOP_MONTHLY";
  }
  if (newDailySpend >= dailyLimit * 0.8) {
    await createAlert(userId, "warning", `Daily budget at 80%: $${newDailySpend.toFixed(2)} / $${dailyLimit.toFixed(2)}`, (dailyLimit * 0.8).toString());
    return "WARNING_DAILY";
  }
  if (newMonthlySpend >= monthlyLimit * 0.8) {
    await createAlert(userId, "warning", `Monthly budget at 80%: $${newMonthlySpend.toFixed(2)} / $${monthlyLimit.toFixed(2)}`, (monthlyLimit * 0.8).toString());
    return "WARNING_MONTHLY";
  }

  return undefined;
}

async function createAlert(userId: number, type: "warning" | "hard_stop" | "loop_detected" | "token_limit", message: string, threshold?: string) {
  const db = getDb();
  if (!db) return;
  await db.from("cost_alerts").insert({ user_id: userId, type, message, threshold: threshold || null });
}

// ─── Pre-execution Budget Check ───────────────────────────────────────────────

export async function canAffordRequest(userId: number, estimatedCost: number): Promise<{ allowed: boolean; reason?: string }> {
  const { daily, monthly } = await ensureBudgets(userId);

  const dailySpend = parseFloat(daily.current_spend);
  const monthlySpend = parseFloat(monthly.current_spend);
  const dailyLimit = parseFloat(daily.limit_usd);
  const monthlyLimit = parseFloat(monthly.limit_usd);

  if (dailySpend + estimatedCost > dailyLimit) {
    return { allowed: false, reason: `Daily budget would be exceeded ($${(dailySpend + estimatedCost).toFixed(2)} > $${dailyLimit.toFixed(2)})` };
  }
  if (monthlySpend + estimatedCost > monthlyLimit) {
    return { allowed: false, reason: `Monthly budget would be exceeded ($${(monthlySpend + estimatedCost).toFixed(2)} > $${monthlyLimit.toFixed(2)})` };
  }
  return { allowed: true };
}

// ─── Cost Analytics ───────────────────────────────────────────────────────────

export async function getCostSummary(userId: number): Promise<{
  todaySpend: number;
  monthSpend: number;
  totalSpend: number;
  todayBreakdown: Record<string, number>;
  monthBreakdown: Record<string, number>;
  projectedMonthly: number;
}> {
  const db = getDb();
  if (!db) return { todaySpend: 0, monthSpend: 0, totalSpend: 0, todayBreakdown: {}, monthBreakdown: {}, projectedMonthly: 0 };

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const { data: allCalls } = await db.from("api_calls").select("*").eq("user_id", userId);

  let todaySpend = 0;
  let monthSpend = 0;
  let totalSpend = 0;
  const todayBreakdown: Record<string, number> = {};
  const monthBreakdown: Record<string, number> = {};

  for (const call of allCalls || []) {
    const cost = parseFloat(call.cost_usd);
    const callDate = new Date(call.created_at);
    totalSpend += cost;

    if (callDate >= monthStart) {
      monthSpend += cost;
      monthBreakdown[call.model] = (monthBreakdown[call.model] || 0) + cost;
    }
    if (callDate >= todayStart) {
      todaySpend += cost;
      todayBreakdown[call.model] = (todayBreakdown[call.model] || 0) + cost;
    }
  }

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const projectedMonthly = dayOfMonth > 0 ? (monthSpend / dayOfMonth) * daysInMonth : 0;

  return {
    todaySpend: Math.round(todaySpend * 100) / 100,
    monthSpend: Math.round(monthSpend * 100) / 100,
    totalSpend: Math.round(totalSpend * 100) / 100,
    todayBreakdown,
    monthBreakdown,
    projectedMonthly: Math.round(projectedMonthly * 100) / 100,
  };
}

export async function getCostHistory(userId: number, days: number = 30): Promise<Array<{ date: string; cost: number; calls: number }>> {
  const db = getDb();
  if (!db) return [];

  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data: calls } = await db
    .from("api_calls")
    .select("cost_usd, created_at")
    .eq("user_id", userId)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: true });

  const byDate: Record<string, { cost: number; calls: number }> = {};
  for (const call of calls || []) {
    const date = new Date(call.created_at).toISOString().split("T")[0];
    if (!byDate[date]) byDate[date] = { cost: 0, calls: 0 };
    byDate[date].cost += parseFloat(call.cost_usd);
    byDate[date].calls++;
  }

  return Object.entries(byDate).map(([date, data]) => ({
    date,
    cost: Math.round(data.cost * 100) / 100,
    calls: data.calls,
  }));
}

export async function getCostBreakdown(userId: number): Promise<{
  byModel: Record<string, { cost: number; calls: number; tokens: number }>;
  byWorker: Record<string, { cost: number; calls: number }>;
  byProject: Record<string, { cost: number; calls: number }>;
  topExpensive: Array<{ model: string; worker: string; cost: number; timestamp: string }>;
}> {
  const db = getDb();
  if (!db) return { byModel: {}, byWorker: {}, byProject: {}, topExpensive: [] };

  const { data: allCalls } = await db
    .from("api_calls")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const byModel: Record<string, { cost: number; calls: number; tokens: number }> = {};
  const byWorker: Record<string, { cost: number; calls: number }> = {};
  const byProject: Record<string, { cost: number; calls: number }> = {};

  for (const call of allCalls || []) {
    const cost = parseFloat(call.cost_usd);
    const tokens = call.input_tokens + call.output_tokens;

    if (!byModel[call.model]) byModel[call.model] = { cost: 0, calls: 0, tokens: 0 };
    byModel[call.model].cost += cost;
    byModel[call.model].calls++;
    byModel[call.model].tokens += tokens;

    if (!byWorker[call.worker]) byWorker[call.worker] = { cost: 0, calls: 0 };
    byWorker[call.worker].cost += cost;
    byWorker[call.worker].calls++;

    const projKey = call.project_id ? `project_${call.project_id}` : "general";
    if (!byProject[projKey]) byProject[projKey] = { cost: 0, calls: 0 };
    byProject[projKey].cost += cost;
    byProject[projKey].calls++;
  }

  const topExpensive = (allCalls || [])
    .sort((a: any, b: any) => parseFloat(b.cost_usd) - parseFloat(a.cost_usd))
    .slice(0, 10)
    .map((c: any) => ({ model: c.model, worker: c.worker, cost: parseFloat(c.cost_usd), timestamp: c.created_at }));

  return { byModel, byWorker, byProject, topExpensive };
}

export async function getBudgetStatus(userId: number): Promise<{
  daily: { limit: number; spent: number; remaining: number; percentage: number; resetsAt: string };
  monthly: { limit: number; spent: number; remaining: number; percentage: number; resetsAt: string };
  alerts: Array<{ type: string; message: string; triggeredAt: string }>;
}> {
  const db = getDb();
  if (!db) return {
    daily: { limit: 10, spent: 0, remaining: 10, percentage: 0, resetsAt: "" },
    monthly: { limit: 100, spent: 0, remaining: 100, percentage: 0, resetsAt: "" },
    alerts: [],
  };

  const { daily, monthly } = await ensureBudgets(userId);

  const dailySpent = parseFloat(daily.current_spend);
  const dailyLimit = parseFloat(daily.limit_usd);
  const monthlySpent = parseFloat(monthly.current_spend);
  const monthlyLimit = parseFloat(monthly.limit_usd);

  const { data: recentAlerts } = await db
    .from("cost_alerts")
    .select("*")
    .eq("user_id", userId)
    .order("triggered_at", { ascending: false })
    .limit(10);

  return {
    daily: {
      limit: dailyLimit,
      spent: Math.round(dailySpent * 100) / 100,
      remaining: Math.round((dailyLimit - dailySpent) * 100) / 100,
      percentage: Math.min(100, Math.round((dailySpent / dailyLimit) * 100)),
      resetsAt: daily.reset_at,
    },
    monthly: {
      limit: monthlyLimit,
      spent: Math.round(monthlySpent * 100) / 100,
      remaining: Math.round((monthlyLimit - monthlySpent) * 100) / 100,
      percentage: Math.min(100, Math.round((monthlySpent / monthlyLimit) * 100)),
      resetsAt: monthly.reset_at,
    },
    alerts: (recentAlerts || []).map((a: any) => ({ type: a.type, message: a.message, triggeredAt: a.triggered_at })),
  };
}

// ─── Loop Detection ───────────────────────────────────────────────────────────

interface TaskCallTracker {
  calls: number;
  totalTokens: number;
  workerCalls: Record<string, number>;
  startedAt: number;
}

const activeTaskTrackers: Map<string, TaskCallTracker> = new Map();

export function startTaskTracking(taskId: string): void {
  activeTaskTrackers.set(taskId, { calls: 0, totalTokens: 0, workerCalls: {}, startedAt: Date.now() });
}

export function endTaskTracking(taskId: string): void {
  activeTaskTrackers.delete(taskId);
}

export async function trackTaskCall(
  taskId: string,
  userId: number,
  worker: string,
  tokens: number
): Promise<{ allowed: boolean; warning?: string }> {
  let tracker = activeTaskTrackers.get(taskId);
  if (!tracker) {
    tracker = { calls: 0, totalTokens: 0, workerCalls: {}, startedAt: Date.now() };
    activeTaskTrackers.set(taskId, tracker);
  }

  tracker.calls++;
  tracker.totalTokens += tokens;
  tracker.workerCalls[worker] = (tracker.workerCalls[worker] || 0) + 1;

  if (tracker.workerCalls[worker] > 5) {
    const db = getDb();
    if (db) {
      await db.from("cost_alerts").insert({
        user_id: userId,
        type: "loop_detected",
        message: `Loop detected: ${worker} called ${tracker.workerCalls[worker]} times in task ${taskId}`,
        threshold: "5",
      });
    }
    return { allowed: false, warning: `Loop detected: ${worker} called ${tracker.workerCalls[worker]} times. Task paused.` };
  }

  if (tracker.totalTokens > 100_000) {
    const db = getDb();
    if (db) {
      await db.from("cost_alerts").insert({
        user_id: userId,
        type: "token_limit",
        message: `Token limit exceeded: ${tracker.totalTokens} tokens in task ${taskId}`,
        threshold: "100000",
      });
    }
    return { allowed: false, warning: `Token limit exceeded: ${tracker.totalTokens.toLocaleString()} tokens used. Task stopped.` };
  }

  if (tracker.totalTokens > 50_000) {
    return { allowed: true, warning: `High token usage: ${tracker.totalTokens.toLocaleString()} tokens in this task.` };
  }

  return { allowed: true };
}
