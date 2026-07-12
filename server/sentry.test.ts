import { describe, it, expect } from "vitest";

describe("Sentry DSN validation", () => {
  it("SENTRY_DSN is set and has valid format", () => {
    const dsn = process.env.SENTRY_DSN;
    expect(dsn).toBeDefined();
    expect(dsn).toMatch(/^https:\/\/[a-f0-9]+@[a-z0-9.]+\.sentry\.io\/\d+$/);
  });

  it("VITE_SENTRY_DSN is set and has valid format", () => {
    const dsn = process.env.VITE_SENTRY_DSN;
    expect(dsn).toBeDefined();
    expect(dsn).toMatch(/^https:\/\/[a-f0-9]+@[a-z0-9.]+\.sentry\.io\/\d+$/);
  });
});
