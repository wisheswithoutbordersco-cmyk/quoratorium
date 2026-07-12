/**
 * Supabase Memory Service — Cross-project, cross-session memory persistence
 * Supplements the existing MySQL-based memoryService with:
 * - pgvector-powered semantic memory retrieval
 * - Global user preferences that persist across all projects
 * - Agent learning that accumulates over time
 * 
 * Gracefully degrades if Supabase is unavailable (falls back to MySQL memory).
 */
import { getSupabaseAdmin } from "./supabase";
import { invokeLLM } from "./_core/llm";

// Memory categories for user preferences
export const MEMORY_CATEGORIES = [
  "coding_style",
  "design_preferences",
  "frameworks",
  "architecture_patterns",
  "tone",
  "deployment_preferences",
  "workflow",
  "tools",
  "naming_conventions",
  "testing_preferences",
] as const;

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export interface UserMemoryEntry {
  id?: string;
  userId: string;
  category: MemoryCategory | string;
  key: string;
  value: any;
  confidence: number;
  source: string;
  timesReinforced: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface AgentMemoryEntry {
  id?: string;
  userId: string;
  category: string;
  key: string;
  value: string;
  confidence: number;
  source?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ─── USER MEMORY (Global Preferences & Patterns) ────────────────────────────

/**
 * Store or update a user memory entry in Supabase.
 * Uses upsert on (user_id, category, key) unique constraint.
 */
export async function setUserMemory(
  userId: string,
  category: MemoryCategory | string,
  key: string,
  value: any,
  source: string = "inferred"
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  try {
    const { error } = await supabase
      .from("user_memory")
      .upsert(
        {
          user_id: userId,
          category,
          key,
          value: typeof value === "string" ? { text: value } : value,
          confidence: 0.8,
          source,
          times_reinforced: 1,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,category,key" }
      );

    if (error) {
      console.warn("[SupabaseMemory] User memory upsert failed:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[SupabaseMemory] Error:", err);
    return false;
  }
}

/**
 * Get all user memories for a specific category
 */
export async function getUserMemoryByCategory(
  userId: string,
  category: MemoryCategory | string
): Promise<UserMemoryEntry[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from("user_memory")
      .select("*")
      .eq("user_id", userId)
      .eq("category", category)
      .order("confidence", { ascending: false });

    if (error) return [];
    return (data || []).map(mapUserMemoryRow);
  } catch {
    return [];
  }
}

/**
 * Get all user memories across all categories
 */
export async function getAllUserMemory(userId: string): Promise<UserMemoryEntry[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from("user_memory")
      .select("*")
      .eq("user_id", userId)
      .order("category")
      .order("confidence", { ascending: false });

    if (error) return [];
    return (data || []).map(mapUserMemoryRow);
  } catch {
    return [];
  }
}

/**
 * Delete a specific user memory entry
 */
export async function deleteUserMemory(userId: string, id: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  try {
    const { error } = await supabase
      .from("user_memory")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Clear all user memories
 */
export async function clearAllUserMemory(userId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  try {
    const { error } = await supabase
      .from("user_memory")
      .delete()
      .eq("user_id", userId);
    return !error;
  } catch {
    return false;
  }
}

// ─── AGENT MEMORY (What Captain Q Learns Over Time) ──────────────────────────

/**
 * Store or update an agent memory entry
 */
export async function setAgentMemory(
  userId: string,
  category: string,
  key: string,
  value: string,
  source?: string
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  try {
    const { error } = await supabase
      .from("agent_memory")
      .upsert(
        {
          user_id: userId,
          category,
          key,
          value,
          confidence: 0.8,
          source: source || "conversation",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,category,key" }
      );

    if (error) {
      console.warn("[SupabaseMemory] Agent memory upsert failed:", error.message);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Get agent memories for a user (optionally filtered by category)
 */
export async function getAgentMemory(
  userId: string,
  category?: string
): Promise<AgentMemoryEntry[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  try {
    let query = supabase
      .from("agent_memory")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (category) {
      query = query.eq("category", category);
    }

    const { data, error } = await query;
    if (error) return [];
    return (data || []).map(mapAgentMemoryRow);
  } catch {
    return [];
  }
}

/**
 * Delete a specific agent memory entry
 */
export async function deleteAgentMemory(userId: string, id: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  try {
    const { error } = await supabase
      .from("agent_memory")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Clear all agent memories for a user
 */
export async function clearAllAgentMemory(userId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  try {
    const { error } = await supabase
      .from("agent_memory")
      .delete()
      .eq("user_id", userId);
    return !error;
  } catch {
    return false;
  }
}

// ─── MEMORY CONTEXT FOR CAPTAIN Q ───────────────────────────────────────────

/**
 * Build a comprehensive memory context string for Captain Q.
 * Combines Supabase-stored global preferences with agent learnings.
 * This is read at the start of every conversation to personalize responses.
 */
export async function getGlobalMemoryContext(userId: string): Promise<string> {
  const [userMemories, agentMemories] = await Promise.all([
    getAllUserMemory(userId),
    getAgentMemory(userId),
  ]);

  if (userMemories.length === 0 && agentMemories.length === 0) {
    return "";
  }

  const parts: string[] = [];

  // Group user memories by category
  if (userMemories.length > 0) {
    parts.push("--- Global User Preferences (Learned Over Time) ---");
    const grouped = groupBy(userMemories, (m) => m.category);
    for (const [category, entries] of Object.entries(grouped)) {
      const categoryLabel = category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const items = entries
        .slice(0, 5)
        .map((e) => {
          const val = typeof e.value === "object" && e.value?.text ? e.value.text : JSON.stringify(e.value);
          return `  • ${e.key}: ${val}`;
        })
        .join("\n");
      parts.push(`${categoryLabel}:\n${items}`);
    }
  }

  // Add agent memories
  if (agentMemories.length > 0) {
    parts.push("\n--- Agent Knowledge (Cross-Session Learning) ---");
    const topMemories = agentMemories.slice(0, 10);
    for (const mem of topMemories) {
      parts.push(`  • [${mem.category}] ${mem.key}: ${mem.value}`);
    }
  }

  return parts.join("\n") + "\n--- End Global Memory Context ---\n";
}

/**
 * Auto-extract and store global memories from a conversation exchange.
 * Called after each substantive assistant response to learn from the interaction.
 * Only extracts CLEAR, EXPLICIT preferences — not inferences.
 */
export async function extractAndStoreGlobalMemories(
  userId: string,
  userMessage: string,
  assistantResponse: string
): Promise<void> {
  // Only process substantive messages
  if (userMessage.length < 30 || assistantResponse.length < 100) return;

  // Quick pattern check before invoking LLM (saves cost)
  const hasPreferenceSignal = /\b(prefer|always|never|like|hate|use|want|my style|I usually)\b/i.test(userMessage);
  if (!hasPreferenceSignal) return;

  try {
    const extractionPrompt = `Analyze this user message and extract any CLEAR, EXPLICIT preferences or patterns that should be remembered globally across all future sessions.

User message: "${userMessage.substring(0, 500)}"

Extract preferences ONLY in these categories if CLEARLY stated:
- coding_style (e.g., prefers functional, uses TypeScript, likes short functions)
- design_preferences (e.g., prefers dark mode, minimalist, specific color schemes)
- frameworks (e.g., prefers React, uses Next.js, likes Tailwind)
- architecture_patterns (e.g., prefers microservices, uses MVC)
- tone (e.g., prefers concise answers, likes detailed explanations)
- deployment_preferences (e.g., uses Vercel, prefers Docker)
- workflow (e.g., TDD, iterative development, prefers planning first)
- tools (e.g., uses VS Code, prefers pnpm, uses ESLint)
- naming_conventions (e.g., camelCase, PascalCase for components)
- testing_preferences (e.g., prefers unit tests, uses Jest)

RULES:
- Only extract CLEAR, EXPLICIT preferences — do NOT infer or guess
- The preference must be something the user DIRECTLY stated
- If no clear preferences, respond with empty array
- Keep keys short and descriptive (e.g., "preferred_language", "css_framework")`;

    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You extract user preferences from messages. Respond only with valid JSON." },
        { role: "user", content: extractionPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "memory_extraction",
          strict: true,
          schema: {
            type: "object",
            properties: {
              preferences: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    category: { type: "string" },
                    key: { type: "string" },
                    value: { type: "string" },
                  },
                  required: ["category", "key", "value"],
                  additionalProperties: false,
                },
              },
            },
            required: ["preferences"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") return;

    const parsed = JSON.parse(content);
    const preferences = parsed.preferences || [];

    // Store each extracted preference
    for (const pref of preferences) {
      if (MEMORY_CATEGORIES.includes(pref.category as any)) {
        await setUserMemory(userId, pref.category, pref.key, pref.value, "conversation_extraction");
      }
    }
  } catch (err) {
    // Silently fail — memory extraction is best-effort
    console.warn("[SupabaseMemory] Extraction failed:", err);
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function mapUserMemoryRow(row: any): UserMemoryEntry {
  return {
    id: row.id,
    userId: row.user_id,
    category: row.category,
    key: row.key,
    value: row.value,
    confidence: row.confidence,
    source: row.source,
    timesReinforced: row.times_reinforced,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAgentMemoryRow(row: any): AgentMemoryEntry {
  return {
    id: row.id,
    userId: row.user_id,
    category: row.category,
    key: row.key,
    value: row.value,
    confidence: row.confidence,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function groupBy<T>(arr: T[], fn: (item: T) => string): Record<string, T[]> {
  return arr.reduce(
    (acc, item) => {
      const key = fn(item);
      (acc[key] = acc[key] || []).push(item);
      return acc;
    },
    {} as Record<string, T[]>
  );
}
