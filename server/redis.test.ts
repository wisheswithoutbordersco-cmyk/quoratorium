import { describe, it, expect } from "vitest";

describe("Redis credentials validation", () => {
  it("UPSTASH_REDIS_REST_URL is set and has valid format", () => {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    expect(url).toBeDefined();
    expect(url).toMatch(/^https:\/\/.*\.upstash\.io$/);
  });

  it("UPSTASH_REDIS_REST_TOKEN is set", () => {
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    expect(token).toBeDefined();
    expect(token!.length).toBeGreaterThan(10);
  });

  it("REDIS_URL is set and uses TLS (rediss://)", () => {
    const url = process.env.REDIS_URL;
    expect(url).toBeDefined();
    expect(url).toMatch(/^rediss:\/\//);
    expect(url).toContain("upstash.io");
  });
});
