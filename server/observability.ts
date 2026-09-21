/**
 * Q Workspace — Observability & Monitoring Service
 *
 * Provides structured logging, distributed tracing, metrics collection,
 * token tracking, worker telemetry, and error aggregation.
 */
import {
  getSupabaseAdmin,
  isSupabaseAvailable,
  isSupabaseConfigured,
} from "./supabase";

// ─── Log Levels ──────────────────────────────────────────────────────────────

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

// ─── Structured Log Entry ────────────────────────────────────────────────────

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  message: string;
  service: string;
  correlationId?: string;
  traceId?: string;
  spanId?: string;
  userId?: number;
  worker?: string;
  metadata?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

// ─── Trace Span ──────────────────────────────────────────────────────────────

export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  service: string;
  worker?: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  status: "running" | "completed" | "failed";
  attributes: Record<string, any>;
  events: Array<{
    name: string;
    timestamp: number;
    attributes?: Record<string, any>;
  }>;
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

export interface MetricPoint {
  name: string;
  value: number;
  timestamp: number;
  labels: Record<string, string>;
  type: "counter" | "gauge" | "histogram";
}

export interface WorkerTelemetry {
  worker: string;
  totalCalls: number;
  successCalls: number;
  failedCalls: number;
  totalTokens: number;
  totalDurationMs: number;
  avgDurationMs: number;
  avgTokensPerCall: number;
  errorRate: number;
  lastCallAt: number;
  p50DurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
}

export interface ErrorAggregate {
  errorKey: string; // hash of message + stack location
  message: string;
  service: string;
  worker?: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
  stack?: string;
  samples: Array<{
    timestamp: number;
    correlationId?: string;
    metadata?: Record<string, any>;
  }>;
}

// ─── In-Memory Storage (Ring Buffers) ────────────────────────────────────────

const MAX_LOGS = 10000;
const MAX_SPANS = 5000;
const MAX_METRICS = 50000;
const MAX_ERRORS = 500;

class RingBuffer<T> {
  private buffer: T[] = [];
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  push(item: T): void {
    if (this.buffer.length >= this.maxSize) {
      this.buffer.shift();
    }
    this.buffer.push(item);
  }

  getAll(): T[] {
    return [...this.buffer];
  }

  getLast(n: number): T[] {
    return this.buffer.slice(-n);
  }

  size(): number {
    return this.buffer.length;
  }

  clear(): void {
    this.buffer = [];
  }

  filter(predicate: (item: T) => boolean): T[] {
    return this.buffer.filter(predicate);
  }
}

// ─── Global State ────────────────────────────────────────────────────────────

const logs = new RingBuffer<LogEntry>(MAX_LOGS);
const spans = new RingBuffer<TraceSpan>(MAX_SPANS);
const metrics = new RingBuffer<MetricPoint>(MAX_METRICS);
const errorAggregates: Map<string, ErrorAggregate> = new Map();
const workerStats: Map<
  string,
  {
    durations: number[];
    tokens: number[];
    successes: number;
    failures: number;
    lastCallAt: number;
  }
> = new Map();

let currentMinLogLevel: LogLevel = "info";
let idCounter = 0;

function generateId(): string {
  return `${Date.now().toString(36)}_${(++idCounter).toString(36)}`;
}

function generateTraceId(): string {
  return `tr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function generateSpanId(): string {
  return `sp_${(++idCounter).toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Structured Logger ───────────────────────────────────────────────────────

export function setLogLevel(level: LogLevel): void {
  currentMinLogLevel = level;
}

export function log(
  level: LogLevel,
  message: string,
  options?: {
    service?: string;
    correlationId?: string;
    traceId?: string;
    spanId?: string;
    userId?: number;
    worker?: string;
    metadata?: Record<string, any>;
    error?: Error;
  }
): LogEntry {
  const entry: LogEntry = {
    id: generateId(),
    timestamp: Date.now(),
    level,
    message,
    service: options?.service || "q-workspace",
    correlationId: options?.correlationId,
    traceId: options?.traceId,
    spanId: options?.spanId,
    userId: options?.userId,
    worker: options?.worker,
    metadata: options?.metadata,
    error: options?.error
      ? {
          name: options.error.name,
          message: options.error.message,
          stack: options.error.stack,
        }
      : undefined,
  };

  if (LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentMinLogLevel]) {
    logs.push(entry);
  }

  // Aggregate errors
  if (level === "error" || level === "fatal") {
    aggregateError(entry);
  }

  return entry;
}

// Convenience methods
export const logger = {
  debug: (msg: string, opts?: Parameters<typeof log>[2]) =>
    log("debug", msg, opts),
  info: (msg: string, opts?: Parameters<typeof log>[2]) =>
    log("info", msg, opts),
  warn: (msg: string, opts?: Parameters<typeof log>[2]) =>
    log("warn", msg, opts),
  error: (msg: string, opts?: Parameters<typeof log>[2]) =>
    log("error", msg, opts),
  fatal: (msg: string, opts?: Parameters<typeof log>[2]) =>
    log("fatal", msg, opts),
};

// ─── Distributed Tracing ─────────────────────────────────────────────────────

export function startTrace(
  name: string,
  options?: {
    service?: string;
    worker?: string;
    parentSpanId?: string;
    traceId?: string;
    attributes?: Record<string, any>;
  }
): TraceSpan {
  const traceId = options?.traceId || generateTraceId();
  const span: TraceSpan = {
    traceId,
    spanId: generateSpanId(),
    parentSpanId: options?.parentSpanId,
    name,
    service: options?.service || "q-workspace",
    worker: options?.worker,
    startTime: Date.now(),
    status: "running",
    attributes: options?.attributes || {},
    events: [],
  };
  spans.push(span);
  return span;
}

export function endTrace(
  span: TraceSpan,
  status: "completed" | "failed" = "completed"
): void {
  span.endTime = Date.now();
  span.durationMs = span.endTime - span.startTime;
  span.status = status;
}

export function addTraceEvent(
  span: TraceSpan,
  name: string,
  attributes?: Record<string, any>
): void {
  span.events.push({ name, timestamp: Date.now(), attributes });
}

// ─── Metrics Collection ──────────────────────────────────────────────────────

export function recordMetric(
  name: string,
  value: number,
  type: MetricPoint["type"] = "gauge",
  labels: Record<string, string> = {}
): void {
  metrics.push({
    name,
    value,
    timestamp: Date.now(),
    labels,
    type,
  });
}

export function incrementCounter(
  name: string,
  labels: Record<string, string> = {},
  amount: number = 1
): void {
  recordMetric(name, amount, "counter", labels);
}

export function recordHistogram(
  name: string,
  value: number,
  labels: Record<string, string> = {}
): void {
  recordMetric(name, value, "histogram", labels);
}

// ─── Worker Telemetry ────────────────────────────────────────────────────────

export function recordWorkerCall(
  worker: string,
  durationMs: number,
  tokens: number,
  success: boolean
): void {
  let stats = workerStats.get(worker);
  if (!stats) {
    stats = {
      durations: [],
      tokens: [],
      successes: 0,
      failures: 0,
      lastCallAt: 0,
    };
    workerStats.set(worker, stats);
  }

  stats.durations.push(durationMs);
  stats.tokens.push(tokens);
  if (success) stats.successes++;
  else stats.failures++;
  stats.lastCallAt = Date.now();

  // Keep only last 1000 data points
  if (stats.durations.length > 1000) {
    stats.durations = stats.durations.slice(-1000);
    stats.tokens = stats.tokens.slice(-1000);
  }

  // Record metrics
  recordHistogram("worker.duration_ms", durationMs, { worker });
  recordHistogram("worker.tokens", tokens, { worker });
  incrementCounter("worker.calls", {
    worker,
    status: success ? "success" : "failure",
  });
}

export function getWorkerTelemetry(worker?: string): WorkerTelemetry[] {
  const results: WorkerTelemetry[] = [];
  const entries = worker
    ? [[worker, workerStats.get(worker)] as const]
    : Array.from(workerStats.entries());

  for (const [w, stats] of entries) {
    if (!stats) continue;

    const totalCalls = stats.successes + stats.failures;
    const sortedDurations = [...stats.durations].sort((a, b) => a - b);

    results.push({
      worker: w,
      totalCalls,
      successCalls: stats.successes,
      failedCalls: stats.failures,
      totalTokens: stats.tokens.reduce((a, b) => a + b, 0),
      totalDurationMs: stats.durations.reduce((a, b) => a + b, 0),
      avgDurationMs:
        totalCalls > 0
          ? Math.round(stats.durations.reduce((a, b) => a + b, 0) / totalCalls)
          : 0,
      avgTokensPerCall:
        totalCalls > 0
          ? Math.round(stats.tokens.reduce((a, b) => a + b, 0) / totalCalls)
          : 0,
      errorRate:
        totalCalls > 0
          ? Math.round((stats.failures / totalCalls) * 10000) / 100
          : 0,
      lastCallAt: stats.lastCallAt,
      p50DurationMs:
        sortedDurations[Math.floor(sortedDurations.length * 0.5)] || 0,
      p95DurationMs:
        sortedDurations[Math.floor(sortedDurations.length * 0.95)] || 0,
      p99DurationMs:
        sortedDurations[Math.floor(sortedDurations.length * 0.99)] || 0,
    });
  }

  return results;
}

// ─── Error Aggregation ───────────────────────────────────────────────────────

function aggregateError(entry: LogEntry): void {
  const errorKey = `${entry.error?.name || "Error"}:${entry.message.slice(0, 100)}:${entry.service}:${entry.worker || ""}`;

  let aggregate = errorAggregates.get(errorKey);
  if (!aggregate) {
    aggregate = {
      errorKey,
      message: entry.error?.message || entry.message,
      service: entry.service,
      worker: entry.worker,
      count: 0,
      firstSeen: entry.timestamp,
      lastSeen: entry.timestamp,
      stack: entry.error?.stack,
      samples: [],
    };
    errorAggregates.set(errorKey, aggregate);
  }

  aggregate.count++;
  aggregate.lastSeen = entry.timestamp;

  // Keep last 5 samples
  if (aggregate.samples.length >= 5) aggregate.samples.shift();
  aggregate.samples.push({
    timestamp: entry.timestamp,
    correlationId: entry.correlationId,
    metadata: entry.metadata,
  });

  // Limit total error aggregates
  if (errorAggregates.size > MAX_ERRORS) {
    // Remove oldest
    let oldestKey = "";
    let oldestTime = Infinity;
    Array.from(errorAggregates.entries()).forEach(([key, agg]) => {
      if (agg.lastSeen < oldestTime) {
        oldestTime = agg.lastSeen;
        oldestKey = key;
      }
    });
    if (oldestKey) errorAggregates.delete(oldestKey);
  }
}

export function getErrorAggregates(limit: number = 50): ErrorAggregate[] {
  return Array.from(errorAggregates.values())
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .slice(0, limit);
}

// ─── Query APIs ──────────────────────────────────────────────────────────────

export function getLogs(options?: {
  level?: LogLevel;
  service?: string;
  worker?: string;
  correlationId?: string;
  since?: number;
  limit?: number;
}): LogEntry[] {
  let result = logs.getAll();

  if (options?.level) {
    const minPriority = LOG_LEVEL_PRIORITY[options.level];
    result = result.filter(l => LOG_LEVEL_PRIORITY[l.level] >= minPriority);
  }
  if (options?.service)
    result = result.filter(l => l.service === options.service);
  if (options?.worker) result = result.filter(l => l.worker === options.worker);
  if (options?.correlationId)
    result = result.filter(l => l.correlationId === options.correlationId);
  if (options?.since)
    result = result.filter(l => l.timestamp >= options.since!);

  result.sort((a, b) => b.timestamp - a.timestamp);
  return result.slice(0, options?.limit || 100);
}

export function getTraces(options?: {
  traceId?: string;
  service?: string;
  worker?: string;
  status?: TraceSpan["status"];
  since?: number;
  limit?: number;
}): TraceSpan[] {
  let result = spans.getAll();

  if (options?.traceId)
    result = result.filter(s => s.traceId === options.traceId);
  if (options?.service)
    result = result.filter(s => s.service === options.service);
  if (options?.worker) result = result.filter(s => s.worker === options.worker);
  if (options?.status) result = result.filter(s => s.status === options.status);
  if (options?.since)
    result = result.filter(s => s.startTime >= options.since!);

  result.sort((a, b) => b.startTime - a.startTime);
  return result.slice(0, options?.limit || 50);
}

export function getMetrics(
  name?: string,
  since?: number,
  limit?: number
): MetricPoint[] {
  let result = metrics.getAll();
  if (name) result = result.filter(m => m.name === name);
  if (since) result = result.filter(m => m.timestamp >= since);
  result.sort((a, b) => b.timestamp - a.timestamp);
  return result.slice(0, limit || 200);
}

// ─── Persisted Execution Analytics ──────────────────────────────────────────

export type ExecutionActivitySource =
  | "orchestrationEvents"
  | "jobs"
  | "apiCalls";

export interface ExecutionTimelineBucket {
  startAt: string;
  endAt: string;
  orchestrationEvents: number;
  jobs: number;
  apiCalls: number;
  total: number;
}

interface ExecutionActivity {
  source: ExecutionActivitySource;
  createdAt: string;
}

export interface ExecutionTimeline {
  startAt: string;
  endAt: string;
  bucketMinutes: number;
  buckets: ExecutionTimelineBucket[];
  totalActivity: number;
  sourceCounts: Record<ExecutionActivitySource, number>;
  truncated: boolean;
}

const MAX_ANALYTICS_ROWS_PER_SOURCE = 5_000;

/** Deterministically groups persisted timestamps into equal, bounded buckets. */
export function buildExecutionTimeline({
  activities,
  hours,
  buckets,
  now = Date.now(),
  truncated = false,
}: {
  activities: ExecutionActivity[];
  hours: number;
  buckets: number;
  now?: number;
  truncated?: boolean;
}): ExecutionTimeline {
  const bucketDurationMs = (hours * 60 * 60 * 1000) / buckets;
  const startMs = now - hours * 60 * 60 * 1000;
  const result: ExecutionTimelineBucket[] = Array.from(
    { length: buckets },
    (_, index) => {
      const bucketStartMs = startMs + index * bucketDurationMs;
      const bucketEndMs =
        index === buckets - 1 ? now : bucketStartMs + bucketDurationMs;
      return {
        startAt: new Date(bucketStartMs).toISOString(),
        endAt: new Date(bucketEndMs).toISOString(),
        orchestrationEvents: 0,
        jobs: 0,
        apiCalls: 0,
        total: 0,
      };
    }
  );
  const sourceCounts: Record<ExecutionActivitySource, number> = {
    orchestrationEvents: 0,
    jobs: 0,
    apiCalls: 0,
  };

  for (const activity of activities) {
    const timestamp = new Date(activity.createdAt).getTime();
    if (!Number.isFinite(timestamp) || timestamp < startMs || timestamp > now)
      continue;
    const index = Math.min(
      buckets - 1,
      Math.floor((timestamp - startMs) / bucketDurationMs)
    );
    result[index][activity.source]++;
    result[index].total++;
    sourceCounts[activity.source]++;
  }

  return {
    startAt: new Date(startMs).toISOString(),
    endAt: new Date(now).toISOString(),
    bucketMinutes: Math.round(bucketDurationMs / 60_000),
    buckets: result,
    totalActivity: Object.values(sourceCounts).reduce(
      (total, value) => total + value,
      0
    ),
    sourceCounts,
    truncated,
  };
}

/**
 * Reads user-scoped records that survive process restarts. In-memory traces are
 * intentionally not presented as a 24-hour historical chart.
 */
export async function getExecutionTimeline(
  userId: number,
  options: { hours: number; buckets: number }
): Promise<ExecutionTimeline> {
  const db = getSupabaseAdmin();
  if (!db) {
    throw new Error(
      "Persisted execution analytics are unavailable because the database is not configured."
    );
  }

  const now = Date.now();
  const since = new Date(now - options.hours * 60 * 60 * 1000).toISOString();
  const until = new Date(now).toISOString();
  const baseQuery = (table: "orchestration_events" | "jobs" | "api_calls") =>
    db
      .from(table)
      .select("created_at", { count: "exact" })
      .eq("user_id", userId)
      .gte("created_at", since)
      .lte("created_at", until)
      .order("created_at", { ascending: false })
      .range(0, MAX_ANALYTICS_ROWS_PER_SOURCE - 1);

  const [eventsResult, jobsResult, apiCallsResult] = await Promise.all([
    baseQuery("orchestration_events"),
    baseQuery("jobs"),
    baseQuery("api_calls"),
  ]);

  if (eventsResult.error || jobsResult.error || apiCallsResult.error) {
    throw new Error("Persisted execution analytics could not be loaded.");
  }

  const activities: ExecutionActivity[] = [];
  const addRows = (
    source: ExecutionActivitySource,
    rows: Array<{ created_at: string | null }> | null
  ) => {
    for (const row of rows || []) {
      if (row.created_at)
        activities.push({ source, createdAt: row.created_at });
    }
  };
  addRows("orchestrationEvents", eventsResult.data);
  addRows("jobs", jobsResult.data);
  addRows("apiCalls", apiCallsResult.data);

  return buildExecutionTimeline({
    activities,
    hours: options.hours,
    buckets: options.buckets,
    now,
    truncated: [eventsResult, jobsResult, apiCallsResult].some(
      result => (result.count || 0) > (result.data?.length || 0)
    ),
  });
}

// ─── Provider and Runtime Health ────────────────────────────────────────────

export type ProviderAvailability = {
  name: "openai" | "anthropic" | "perplexity" | "openrouter" | "forge";
  configured: boolean;
};

const providerConfiguration: Array<{
  name: ProviderAvailability["name"];
  envName: string;
}> = [
  { name: "openai", envName: "OPENAI_API_KEY" },
  { name: "anthropic", envName: "ANTHROPIC_API_KEY" },
  { name: "perplexity", envName: "SONAR_API_KEY" },
  { name: "openrouter", envName: "OPENROUTER_API_KEY" },
  { name: "forge", envName: "BUILT_IN_FORGE_API_KEY" },
];

/** Returns provider configuration state only; credentials never leave the process. */
export function getProviderAvailability(): ProviderAvailability[] {
  return providerConfiguration.map(({ name, envName }) => ({
    name,
    configured: Boolean(process.env[envName]?.trim()),
  }));
}

export interface PoolHealth {
  status: "healthy" | "degraded" | "unknown" | "unavailable";
  message: string;
  providers: ProviderAvailability[];
  configuredProviderCount: number;
  recentTelemetry: {
    windowStartedAt: string;
    calls: number;
    failures: number;
    errorRate: number | null;
    observedWorkers: string[];
    lastCallAt: string | null;
  };
}

/**
 * A configured provider is not reported as a successful API call. In the
 * absence of recent worker telemetry the truthful result is `unknown`.
 */
export function getPoolHealth(now = Date.now()): PoolHealth {
  const providers = getProviderAvailability();
  const configuredProviderCount = providers.filter(
    provider => provider.configured
  ).length;
  const windowStartedAtMs = now - 15 * 60 * 1000;
  const recentCalls = metrics
    .getAll()
    .filter(
      metric =>
        metric.name === "worker.calls" && metric.timestamp >= windowStartedAtMs
    );
  const calls = recentCalls.reduce((total, metric) => total + metric.value, 0);
  const failures = recentCalls
    .filter(metric => metric.labels.status === "failure")
    .reduce((total, metric) => total + metric.value, 0);
  const lastCallMs = recentCalls.reduce(
    (latest, metric) => Math.max(latest, metric.timestamp),
    0
  );
  const errorRate =
    calls > 0 ? Math.round((failures / calls) * 10_000) / 100 : null;
  const recentTelemetry = {
    windowStartedAt: new Date(windowStartedAtMs).toISOString(),
    calls,
    failures,
    errorRate,
    observedWorkers: Array.from(
      new Set(recentCalls.map(metric => metric.labels.worker).filter(Boolean))
    ).sort(),
    lastCallAt: lastCallMs ? new Date(lastCallMs).toISOString() : null,
  };

  if (configuredProviderCount === 0) {
    return {
      status: "unavailable",
      message: "No AI provider credentials are configured.",
      providers,
      configuredProviderCount,
      recentTelemetry,
    };
  }
  if (calls === 0) {
    return {
      status: "unknown",
      message:
        "Providers are configured, but no worker calls were observed in the last 15 minutes.",
      providers,
      configuredProviderCount,
      recentTelemetry,
    };
  }
  if (errorRate !== null && errorRate > 20) {
    return {
      status: "degraded",
      message: "Recent worker telemetry shows an elevated failure rate.",
      providers,
      configuredProviderCount,
      recentTelemetry,
    };
  }
  return {
    status: "healthy",
    message:
      "Configured providers have recent worker telemetry with an acceptable failure rate.",
    providers,
    configuredProviderCount,
    recentTelemetry,
  };
}

export interface SystemHealth {
  ok: boolean;
  status: "healthy" | "degraded" | "unavailable";
  checkedAt: string;
  checks: Array<{
    name: "database" | "providers" | "workerTelemetry";
    status: "available" | "unavailable" | "unknown" | "not_configured";
  }>;
}

async function checkSupabaseWithin(
  timeoutMs: number
): Promise<"available" | "unavailable" | "unknown"> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      isSupabaseAvailable().then(available =>
        available ? ("available" as const) : ("unavailable" as const)
      ),
      new Promise<"unknown">(resolve => {
        timeout = setTimeout(() => resolve("unknown"), timeoutMs);
      }),
    ]);
  } catch {
    return "unavailable";
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/** Compact, non-secret health state suitable for lightweight navigation polling. */
export async function getSystemHealth(): Promise<SystemHealth> {
  const poolHealth = getPoolHealth();
  const databaseStatus = isSupabaseConfigured()
    ? await checkSupabaseWithin(500)
    : "not_configured";
  const providerStatus =
    poolHealth.configuredProviderCount > 0 ? "available" : "not_configured";
  const telemetryStatus =
    poolHealth.status === "healthy"
      ? "available"
      : poolHealth.status === "unavailable"
        ? "unavailable"
        : "unknown";
  const unavailable =
    databaseStatus === "unavailable" || databaseStatus === "not_configured";
  const degraded =
    databaseStatus === "unknown" ||
    providerStatus === "not_configured" ||
    poolHealth.status === "degraded";

  return {
    ok: !unavailable,
    status: unavailable ? "unavailable" : degraded ? "degraded" : "healthy",
    checkedAt: new Date().toISOString(),
    checks: [
      { name: "database", status: databaseStatus },
      { name: "providers", status: providerStatus },
      { name: "workerTelemetry", status: telemetryStatus },
    ],
  };
}

// ─── Dashboard Summary ───────────────────────────────────────────────────────

export interface ObservabilitySummary {
  totalLogs: number;
  totalSpans: number;
  totalMetrics: number;
  errorCount: number;
  warnCount: number;
  activeTraces: number;
  workerTelemetry: WorkerTelemetry[];
  topErrors: ErrorAggregate[];
  recentLogs: LogEntry[];
  systemHealth: {
    status: "healthy" | "degraded" | "critical";
    uptime: number;
    errorRate: number;
    avgResponseTime: number;
  };
}

const startTime = Date.now();

export function getObservabilitySummary(): ObservabilitySummary {
  const allLogs = logs.getAll();
  const last5Min = Date.now() - 300_000;
  const recentLogs = allLogs.filter(l => l.timestamp >= last5Min);
  const recentErrors = recentLogs.filter(
    l => l.level === "error" || l.level === "fatal"
  );
  const activeTraces = spans.filter(s => s.status === "running");
  const telemetry = getWorkerTelemetry();

  const totalCalls = telemetry.reduce((a, t) => a + t.totalCalls, 0);
  const totalFailed = telemetry.reduce((a, t) => a + t.failedCalls, 0);
  const errorRate = totalCalls > 0 ? (totalFailed / totalCalls) * 100 : 0;
  const avgResponseTime =
    telemetry.length > 0
      ? Math.round(
          telemetry.reduce((a, t) => a + t.avgDurationMs, 0) / telemetry.length
        )
      : 0;

  let healthStatus: "healthy" | "degraded" | "critical" = "healthy";
  if (errorRate > 20 || recentErrors.length > 10) healthStatus = "critical";
  else if (errorRate > 5 || recentErrors.length > 3) healthStatus = "degraded";

  return {
    totalLogs: allLogs.length,
    totalSpans: spans.size(),
    totalMetrics: metrics.size(),
    errorCount: allLogs.filter(l => l.level === "error" || l.level === "fatal")
      .length,
    warnCount: allLogs.filter(l => l.level === "warn").length,
    activeTraces: activeTraces.length,
    workerTelemetry: telemetry,
    topErrors: getErrorAggregates(10),
    recentLogs: getLogs({ limit: 20 }),
    systemHealth: {
      status: healthStatus,
      uptime: Date.now() - startTime,
      errorRate: Math.round(errorRate * 100) / 100,
      avgResponseTime,
    },
  };
}

// ─── Reset (for testing) ─────────────────────────────────────────────────────

export function resetObservability(): void {
  logs.clear();
  spans.clear();
  metrics.clear();
  errorAggregates.clear();
  workerStats.clear();
  idCounter = 0;
}
