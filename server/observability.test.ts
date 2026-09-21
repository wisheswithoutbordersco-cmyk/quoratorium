import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

vi.mock("./supabase", () => ({
  getSupabaseAdmin: vi.fn(),
  isSupabaseAvailable: vi.fn(),
  isSupabaseConfigured: vi.fn(),
}));

import * as supabase from "./supabase";
import {
  buildExecutionTimeline,
  getPoolHealth,
  incrementCounter,
  resetObservability,
} from "./observability";
import { observabilityRouter } from "./routers/observability";
import { systemRouter } from "./_core/systemRouter";

const context = { user: { id: 42 } } as TrpcContext;

const environmentKeys = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "SONAR_API_KEY",
  "OPENROUTER_API_KEY",
  "BUILT_IN_FORGE_API_KEY",
] as const;
const originalEnvironment = Object.fromEntries(environmentKeys.map(key => [key, process.env[key]]));

afterEach(() => {
  resetObservability();
  vi.clearAllMocks();
  for (const key of environmentKeys) {
    if (originalEnvironment[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnvironment[key];
  }
});

describe("persisted execution analytics", () => {
  it("uses deterministic buckets and ignores activity outside the requested window", () => {
    const now = Date.parse("2026-01-02T00:00:00.000Z");
    const timeline = buildExecutionTimeline({
      now,
      hours: 1,
      buckets: 4,
      activities: [
        { source: "orchestrationEvents", createdAt: "2026-01-01T23:00:00.000Z" },
        { source: "jobs", createdAt: "2026-01-01T23:15:00.000Z" },
        { source: "apiCalls", createdAt: "2026-01-01T23:45:00.000Z" },
        { source: "apiCalls", createdAt: "2026-01-01T22:59:59.000Z" },
      ],
    });

    expect(timeline.bucketMinutes).toBe(15);
    expect(timeline.totalActivity).toBe(3);
    expect(timeline.sourceCounts).toEqual({ orchestrationEvents: 1, jobs: 1, apiCalls: 1 });
    expect(timeline.buckets.map(bucket => bucket.total)).toEqual([1, 1, 0, 1]);
  });

  it("scopes persisted execution records to the authenticated caller", async () => {
    const calls: Array<{ method: string; value?: unknown }> = [];
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((_column: string, value: unknown) => {
        calls.push({ method: "eq", value });
        return query;
      }),
      gte: vi.fn(() => query),
      lte: vi.fn(() => query),
      order: vi.fn(() => query),
      range: vi.fn(() => Promise.resolve({ data: [], count: 0, error: null })),
    };
    vi.mocked(supabase.getSupabaseAdmin).mockReturnValue({ from: vi.fn(() => query) } as any);

    const caller = observabilityRouter.createCaller(context);
    await expect(caller.executionTimeline({ hours: 24, buckets: 48 })).resolves.toMatchObject({
      totalActivity: 0,
      buckets: expect.arrayContaining([expect.objectContaining({ total: 0 })]),
    });
    expect(calls.filter(call => call.method === "eq")).toHaveLength(3);
    expect(calls.filter(call => call.method === "eq").every(call => call.value === 42)).toBe(true);
  });
});

describe("derived pool health", () => {
  it("reports unavailable instead of claiming an optimal pool without configured providers", () => {
    for (const key of environmentKeys) delete process.env[key];
    expect(getPoolHealth(Date.parse("2026-01-01T00:00:00.000Z"))).toMatchObject({
      status: "unavailable",
      configuredProviderCount: 0,
      recentTelemetry: { calls: 0, errorRate: null },
    });
  });

  it("reports unknown when a provider is configured but no recent telemetry exists", () => {
    process.env.OPENAI_API_KEY = "configured";
    expect(getPoolHealth(Date.parse("2026-01-01T00:00:00.000Z"))).toMatchObject({
      status: "unknown",
      configuredProviderCount: 1,
    });
  });

  it("degrades the pool only from observed recent failure telemetry", () => {
    process.env.OPENAI_API_KEY = "configured";
    incrementCounter("worker.calls", { worker: "builder", status: "failure" }, 3);
    incrementCounter("worker.calls", { worker: "builder", status: "success" }, 1);

    expect(getPoolHealth()).toMatchObject({
      status: "degraded",
      recentTelemetry: { calls: 4, failures: 3, errorRate: 75, observedWorkers: ["builder"] },
    });
  });
});

describe("system health", () => {
  it("returns bounded non-secret check states instead of a bare ok response", async () => {
    vi.mocked(supabase.isSupabaseConfigured).mockReturnValue(false);
    for (const key of environmentKeys) delete process.env[key];
    const caller = systemRouter.createCaller({} as TrpcContext);

    await expect(caller.health({ timestamp: Date.now() })).resolves.toEqual(expect.objectContaining({
      ok: false,
      status: "unavailable",
      checkedAt: expect.any(String),
      checks: expect.arrayContaining([
        { name: "database", status: "not_configured" },
        { name: "providers", status: "not_configured" },
        { name: "workerTelemetry", status: "unavailable" },
      ]),
    }));
  });
});
