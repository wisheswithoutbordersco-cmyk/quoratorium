/**
 * Redis Client Module
 * 
 * Provides two Redis clients:
 * 1. Upstash REST client (@upstash/redis) — for caching, rate limiting
 * 2. ioredis client — for BullMQ job queue (requires persistent connection)
 * 
 * Both gracefully fall back if Redis is unreachable.
 */

import { Redis as UpstashRedis } from "@upstash/redis";
import Redis from "ioredis";

// ─── Upstash REST Client (Caching & Rate Limiting) ─────────────────────────

let upstashClient: UpstashRedis | null = null;

export function getUpstashClient(): UpstashRedis | null {
  if (upstashClient) return upstashClient;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.warn("[Redis] UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not set — caching disabled");
    return null;
  }

  try {
    upstashClient = new UpstashRedis({ url, token });
    return upstashClient;
  } catch (err) {
    console.warn("[Redis] Failed to create Upstash client:", err);
    return null;
  }
}

// ─── ioredis Client (BullMQ) ────────────────────────────────────────────────

let ioredisClient: Redis | null = null;
let ioredisAvailable = false;

export function getIORedisClient(): Redis | null {
  if (ioredisClient) return ioredisClient;

  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    console.warn("[Redis] REDIS_URL not set — BullMQ will use in-memory fallback");
    return null;
  }

  try {
    ioredisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: null, // Required for BullMQ
      enableReadyCheck: false, // Recommended for Upstash
      tls: {
        rejectUnauthorized: false, // Upstash uses self-signed in some regions
      },
      retryStrategy(times) {
        if (times > 3) {
          console.warn("[Redis] Connection failed after 3 retries — falling back to in-memory");
          return null; // Stop retrying
        }
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    ioredisClient.on("connect", () => {
      ioredisAvailable = true;
      console.log("[Redis] ioredis connected to Upstash");
    });

    ioredisClient.on("error", (err) => {
      ioredisAvailable = false;
      console.warn("[Redis] ioredis error:", err.message);
    });

    ioredisClient.on("close", () => {
      ioredisAvailable = false;
    });

    // Attempt connection
    ioredisClient.connect().catch(() => {
      console.warn("[Redis] ioredis initial connection failed — BullMQ will use in-memory fallback");
    });

    return ioredisClient;
  } catch (err) {
    console.warn("[Redis] Failed to create ioredis client:", err);
    return null;
  }
}

export function isIORedisAvailable(): boolean {
  return ioredisAvailable;
}

// ─── Caching Layer ──────────────────────────────────────────────────────────

const inMemoryCache = new Map<string, { value: string; expiresAt: number }>();

/**
 * Get a cached value. Falls back to in-memory cache if Redis unavailable.
 */
export async function cacheGet<T = string>(key: string): Promise<T | null> {
  const client = getUpstashClient();

  if (client) {
    try {
      const value = await client.get<T>(key);
      return value;
    } catch (err) {
      console.warn("[Cache] Redis GET failed, checking in-memory:", (err as Error).message);
    }
  }

  // In-memory fallback
  const entry = inMemoryCache.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    try {
      return JSON.parse(entry.value) as T;
    } catch {
      return entry.value as unknown as T;
    }
  }
  inMemoryCache.delete(key);
  return null;
}

/**
 * Set a cached value with TTL (seconds). Falls back to in-memory cache.
 */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number = 300): Promise<void> {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  const client = getUpstashClient();

  if (client) {
    try {
      await client.set(key, serialized, { ex: ttlSeconds });
      return;
    } catch (err) {
      console.warn("[Cache] Redis SET failed, using in-memory:", (err as Error).message);
    }
  }

  // In-memory fallback
  inMemoryCache.set(key, {
    value: serialized,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

/**
 * Delete a cached value.
 */
export async function cacheDel(key: string): Promise<void> {
  const client = getUpstashClient();

  if (client) {
    try {
      await client.del(key);
    } catch (err) {
      console.warn("[Cache] Redis DEL failed:", (err as Error).message);
    }
  }

  inMemoryCache.delete(key);
}

/**
 * Rate limiting using Redis INCR with TTL.
 * Returns { allowed: boolean, remaining: number, resetInSeconds: number }
 */
export async function checkRateLimit(
  userId: string,
  action: string,
  maxRequests: number = 60,
  windowSeconds: number = 60
): Promise<{ allowed: boolean; remaining: number; resetInSeconds: number }> {
  const key = `ratelimit:${action}:${userId}`;
  const client = getUpstashClient();

  if (client) {
    try {
      const pipeline = client.pipeline();
      pipeline.incr(key);
      pipeline.ttl(key);
      const results = await pipeline.exec();
      
      const count = results[0] as number;
      const ttl = results[1] as number;

      // Set TTL on first request in window
      if (ttl === -1) {
        await client.expire(key, windowSeconds);
      }

      return {
        allowed: count <= maxRequests,
        remaining: Math.max(0, maxRequests - count),
        resetInSeconds: ttl > 0 ? ttl : windowSeconds,
      };
    } catch (err) {
      console.warn("[RateLimit] Redis check failed, allowing request:", (err as Error).message);
    }
  }

  // Fallback: always allow if Redis is unavailable
  return { allowed: true, remaining: maxRequests, resetInSeconds: windowSeconds };
}

// ─── Specialized Cache Functions ────────────────────────────────────────────

/**
 * Cache AI model responses for identical prompts (5 min TTL).
 */
export async function cacheAIResponse(promptHash: string, response: string): Promise<void> {
  await cacheSet(`ai:response:${promptHash}`, response, 300); // 5 minutes
}

export async function getCachedAIResponse(promptHash: string): Promise<string | null> {
  return cacheGet<string>(`ai:response:${promptHash}`);
}

/**
 * Cache user memory lookups (2 min TTL to reduce Supabase queries).
 */
export async function cacheUserMemory(userId: string, memories: unknown): Promise<void> {
  await cacheSet(`memory:user:${userId}`, memories, 120); // 2 minutes
}

export async function getCachedUserMemory<T = unknown>(userId: string): Promise<T | null> {
  return cacheGet<T>(`memory:user:${userId}`);
}

/**
 * Invalidate user memory cache (when memory is updated).
 */
export async function invalidateUserMemoryCache(userId: string): Promise<void> {
  await cacheDel(`memory:user:${userId}`);
}

/**
 * Cache template listings (10 min TTL).
 */
export async function cacheTemplates(templates: unknown): Promise<void> {
  await cacheSet("templates:all", templates, 600); // 10 minutes
}

export async function getCachedTemplates<T = unknown>(): Promise<T | null> {
  return cacheGet<T>("templates:all");
}

// ─── Cleanup ────────────────────────────────────────────────────────────────

// Periodically clean expired in-memory entries (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  const keys = Array.from(inMemoryCache.keys());
  for (const key of keys) {
    const entry = inMemoryCache.get(key);
    if (entry && entry.expiresAt <= now) {
      inMemoryCache.delete(key);
    }
  }
}, 5 * 60 * 1000);
