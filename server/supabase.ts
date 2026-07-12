/**
 * Supabase Client Module
 * Used as the intelligence/memory layer (pgvector knowledge base, agent memory)
 * MySQL/Drizzle remains the primary transactional database.
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _supabaseAdmin: SupabaseClient | null = null;

/**
 * Get the Supabase admin client (uses service_role key, bypasses RLS)
 * Used for all backend operations on the intelligence/memory layer.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (_supabaseAdmin) return _supabaseAdmin;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    console.warn("[Supabase] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — memory layer disabled");
    return null;
  }

  _supabaseAdmin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return _supabaseAdmin;
}

/**
 * Synchronous check if Supabase credentials are configured
 */
export function isSupabaseConfigured(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Check if Supabase is configured and reachable
 */
export async function isSupabaseAvailable(): Promise<boolean> {
  const client = getSupabaseAdmin();
  if (!client) return false;

  try {
    // Simple health check — query a table (will fail gracefully if table doesn't exist yet)
    const { error } = await client.from("agent_memory").select("id").limit(1);
    // If the error is about the table not existing, Supabase itself is still reachable
    if (error && !error.message.includes("does not exist")) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
