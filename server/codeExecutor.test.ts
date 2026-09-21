import { describe, expect, it } from "vitest";
import { getSandboxProcessEnvironment } from "./codeExecutor";

describe("Toríu code-execution environment", () => {
  it("does not forward application credentials into submitted code", () => {
    const env = getSandboxProcessEnvironment();

    expect(env.NODE_ENV).toBe("sandbox");
    expect(env.GITHUB_TOKEN).toBeUndefined();
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.OPENROUTER_API_KEY).toBeUndefined();
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    expect(env.STRIPE_SECRET_KEY).toBeUndefined();
    expect(env.OWNER_ACCESS_CODE).toBeUndefined();
  });
});
