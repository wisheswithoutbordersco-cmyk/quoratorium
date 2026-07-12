import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

describe("Supabase credentials validation", () => {
  it("should connect to Supabase with valid credentials", async () => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    expect(url).toBeDefined();
    expect(key).toBeDefined();

    const client = createClient(url!, key!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Attempt a lightweight RPC or schema introspection call
    // Even if tables don't exist yet, a valid connection should not throw auth errors
    const { error } = await client.rpc("version");

    // If the function doesn't exist, that's fine — it means we connected but the function isn't there
    // An auth error would indicate invalid credentials
    if (error) {
      expect(error.message).not.toContain("Invalid API key");
      expect(error.message).not.toContain("invalid_credentials");
      expect(error.code).not.toBe("PGRST301"); // JWT error
    }
  });
});
