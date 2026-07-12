/**
 * Q Workspace — Job Queue Engine (Supabase)
 * In-process queue with concurrency control, retries, exponential backoff, dead letter queue.
 */
import { nanoid } from "nanoid";
import { getSupabaseAdmin } from "./supabase";
import { getUpstashClient } from "./redis";

function getDb() {
  return getSupabaseAdmin();
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type JobType = "ai_chat" | "code_generation" | "code_validation" | "research" | "image_generation" | "browser_task" | "code_execution" | "embedding" | "deployment";
export type JobStatus = "queued" | "processing" | "completed" | "failed" | "retrying" | "cancelled" | "dead_letter";
export type JobPriority = "critical" | "high" | "normal" | "low";

export interface Job {
  id: string;
  user_id: number;
  type: string;
  status: string;
  priority: string;
  payload: any;
  result: any;
  error: string | null;
  progress: number;
  retries: number;
  max_retries: number;
  timeout: number;
  project_id: number | null;
  parent_job_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

// Legacy aliases for backward compat
export type { Job as InsertJob };

export type JobProcessor = (job: Job, onProgress: (pct: number) => Promise<void>) => Promise<any>;

interface CreateJobOptions {
  userId: number;
  type: JobType;
  payload: any;
  priority?: JobPriority;
  timeout?: number;
  maxRetries?: number;
  projectId?: number;
  parentJobId?: string;
}

const PRIORITY_WEIGHT: Record<string, number> = { critical: 4, high: 3, normal: 2, low: 1 };

// ─── Queue Engine ─────────────────────────────────────────────────────────────

class JobQueueEngine {
  private processors: Map<JobType, JobProcessor> = new Map();
  private activeJobs: Map<string, { abort: AbortController; timeout: NodeJS.Timeout }> = new Map();
  private maxConcurrency = 3;
  private listeners: Map<string, Set<(event: any) => void>> = new Map();

  registerProcessor(type: JobType, processor: JobProcessor) {
    this.processors.set(type, processor);
  }

  async createJob(options: CreateJobOptions): Promise<Job> {
    const db = getDb();
    if (!db) throw new Error("Database unavailable");

    const id = `job_${nanoid(16)}`;
    const { data: job, error } = await db
      .from("jobs")
      .insert({
        id,
        user_id: options.userId,
        type: options.type,
        status: "queued",
        priority: options.priority || "normal",
        payload: options.payload,
        timeout: options.timeout || 60000,
        max_retries: options.maxRetries ?? 3,
        project_id: options.projectId || null,
        parent_job_id: options.parentJobId || null,
        progress: 0,
        retries: 0,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create job: ${error.message}`);

    this.emit(id, { type: "created", job });

    const redis = getUpstashClient();
    if (redis) {
      redis.incr(`jobs:active:${options.userId}`).catch(() => {});
    }

    this.processQueue();
    return job;
  }

  async getJob(id: string): Promise<Job | null> {
    const db = getDb();
    if (!db) return null;
    const { data } = await db.from("jobs").select("*").eq("id", id).single();
    return data || null;
  }

  async listJobs(options: {
    userId?: number;
    status?: JobStatus;
    type?: JobType;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ jobs: Job[]; total: number }> {
    const db = getDb();
    if (!db) return { jobs: [], total: 0 };

    let query = db.from("jobs").select("*", { count: "exact" });
    if (options.userId) query = query.eq("user_id", options.userId);
    if (options.status) query = query.eq("status", options.status);
    if (options.type) query = query.eq("type", options.type);

    const { data, count } = await query
      .order("created_at", { ascending: false })
      .range(options.offset || 0, (options.offset || 0) + (options.limit || 50) - 1);

    return { jobs: data || [], total: count || 0 };
  }

  async cancelJob(id: string, userId: number): Promise<boolean> {
    const db = getDb();
    if (!db) return false;

    const job = await this.getJob(id);
    if (!job || job.user_id !== userId) return false;
    if (job.status === "completed" || job.status === "cancelled") return false;

    const active = this.activeJobs.get(id);
    if (active) {
      active.abort.abort();
      clearTimeout(active.timeout);
      this.activeJobs.delete(id);
    }

    await db.from("jobs").update({ status: "cancelled", completed_at: new Date().toISOString() }).eq("id", id);
    this.emit(id, { type: "cancelled" });
    return true;
  }

  async retryJob(id: string, userId: number): Promise<Job | null> {
    const db = getDb();
    if (!db) return null;

    const job = await this.getJob(id);
    if (!job || job.user_id !== userId) return null;
    if (job.status !== "failed" && job.status !== "dead_letter") return null;

    await db.from("jobs").update({ status: "queued", retries: 0, error: null, progress: 0 }).eq("id", id);
    const updated = await this.getJob(id);
    this.processQueue();
    return updated;
  }

  async getStats(userId?: number): Promise<{
    total: number;
    queued: number;
    processing: number;
    completed: number;
    failed: number;
    deadLetter: number;
    avgDurationMs: number;
    successRate: number;
  }> {
    const db = getDb();
    if (!db) return { total: 0, queued: 0, processing: 0, completed: 0, failed: 0, deadLetter: 0, avgDurationMs: 0, successRate: 0 };

    let query = db.from("jobs").select("*");
    if (userId) query = query.eq("user_id", userId);
    const { data: all } = await query;

    const stats = { total: 0, queued: 0, processing: 0, completed: 0, failed: 0, deadLetter: 0, avgDurationMs: 0, successRate: 0 };
    let totalDuration = 0;
    let completedCount = 0;

    for (const job of all || []) {
      stats.total++;
      switch (job.status) {
        case "queued": stats.queued++; break;
        case "processing": case "retrying": stats.processing++; break;
        case "completed": stats.completed++; break;
        case "failed": stats.failed++; break;
        case "dead_letter": stats.deadLetter++; break;
      }
      if (job.status === "completed" && job.started_at && job.completed_at) {
        totalDuration += new Date(job.completed_at).getTime() - new Date(job.started_at).getTime();
        completedCount++;
      }
    }

    stats.avgDurationMs = completedCount > 0 ? Math.round(totalDuration / completedCount) : 0;
    const finishedJobs = stats.completed + stats.failed + stats.deadLetter;
    stats.successRate = finishedJobs > 0 ? Math.round((stats.completed / finishedJobs) * 100) : 100;

    return stats;
  }

  subscribe(jobId: string, listener: (event: any) => void): () => void {
    if (!this.listeners.has(jobId)) {
      this.listeners.set(jobId, new Set());
    }
    this.listeners.get(jobId)!.add(listener);
    return () => {
      this.listeners.get(jobId)?.delete(listener);
      if (this.listeners.get(jobId)?.size === 0) {
        this.listeners.delete(jobId);
      }
    };
  }

  private emit(jobId: string, event: any) {
    this.listeners.get(jobId)?.forEach(fn => fn(event));
    const redis = getUpstashClient();
    if (redis) {
      redis.publish(`job:${jobId}`, JSON.stringify(event)).catch(() => {});
    }
  }

  private async processQueue() {
    if (this.activeJobs.size >= this.maxConcurrency) return;

    const db = getDb();
    if (!db) return;

    const { data: queued } = await db
      .from("jobs")
      .select("*")
      .eq("status", "queued")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(this.maxConcurrency - this.activeJobs.size);

    const sorted = (queued || []).sort((a: any, b: any) => (PRIORITY_WEIGHT[b.priority] || 2) - (PRIORITY_WEIGHT[a.priority] || 2));

    for (const job of sorted) {
      if (this.activeJobs.size >= this.maxConcurrency) break;
      this.executeJob(job);
    }
  }

  private async executeJob(job: Job) {
    const db = getDb();
    if (!db) return;

    const processor = this.processors.get(job.type as JobType);
    if (!processor) {
      await db.from("jobs").update({ status: "failed", error: `No processor registered for type: ${job.type}` }).eq("id", job.id);
      this.emit(job.id, { type: "failed", error: "No processor" });
      return;
    }

    await db.from("jobs").update({ status: "processing", started_at: new Date().toISOString() }).eq("id", job.id);
    this.emit(job.id, { type: "processing" });

    const abort = new AbortController();
    const timeoutHandle = setTimeout(() => { abort.abort(); }, job.timeout);
    this.activeJobs.set(job.id, { abort, timeout: timeoutHandle });

    const onProgress = async (pct: number) => {
      const clamped = Math.max(0, Math.min(100, Math.round(pct)));
      await db.from("jobs").update({ progress: clamped }).eq("id", job.id);
      this.emit(job.id, { type: "progress", progress: clamped });
    };

    try {
      const result = await Promise.race([
        processor(job, onProgress),
        new Promise((_, reject) => {
          abort.signal.addEventListener("abort", () => reject(new Error("Job timed out")));
        }),
      ]);

      clearTimeout(timeoutHandle);
      this.activeJobs.delete(job.id);

      await db.from("jobs").update({ status: "completed", result: result as any, progress: 100, completed_at: new Date().toISOString() }).eq("id", job.id);
      this.emit(job.id, { type: "completed", result });

    } catch (error: any) {
      clearTimeout(timeoutHandle);
      this.activeJobs.delete(job.id);

      const errorMsg = error?.message || "Unknown error";
      const currentRetries = job.retries + 1;

      if (currentRetries >= job.max_retries) {
        await db.from("jobs").update({ status: "dead_letter", error: errorMsg, retries: currentRetries, completed_at: new Date().toISOString() }).eq("id", job.id);
        this.emit(job.id, { type: "dead_letter", error: errorMsg });
      } else {
        await db.from("jobs").update({ status: "retrying", error: errorMsg, retries: currentRetries }).eq("id", job.id);
        this.emit(job.id, { type: "retrying", retry: currentRetries, error: errorMsg });

        const backoffMs = Math.min(1000 * Math.pow(2, currentRetries), 30000);
        setTimeout(async () => {
          await db.from("jobs").update({ status: "queued" }).eq("id", job.id);
          this.processQueue();
        }, backoffMs);
      }
    }

    this.processQueue();
  }
}

// ─── Singleton Instance ───────────────────────────────────────────────────────

export const jobQueue = new JobQueueEngine();
