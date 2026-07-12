/**
 * Patent 1: Two-Tier Sandboxed Memory System
 * 
 * Inner Sandbox (Protected Memory / "Heaven"):
 *   - Stores high-priority info that NEVER gets deleted
 *   - Credentials, names, numbers, business decisions, deadlines, preferences, requirements, action items
 * 
 * Outer Sandbox (Disposable Memory):
 *   - Stores ordinary conversation context
 *   - Subject to garbage collection when capacity thresholds are reached
 * 
 * Features:
 *   - AI Auto-Detection: classifies messages as important vs disposable
 *   - Speech Cleanup: removes filler words/stutters before storing
 *   - Garbage Collection: compresses/removes oldest when outer sandbox > 100 entries
 *   - Danger Zone Evacuation: rotates important messages to protected memory in batches
 *   - Memory Recall: pulls relevant protected memories into active context
 */
import { getSupabaseAdmin } from "./supabase";
import { invokeLLM } from "./_core/llm";

// ─── Types ──────────────────────────────────────────────────────────────────

export type MemoryTier = "protected" | "disposable";

export type ProtectedCategory =
  | "credential"
  | "name"
  | "number"
  | "business_decision"
  | "deadline"
  | "preference"
  | "requirement"
  | "action_item"
  | "project_context"
  | "personal_info";

export interface ProtectedMemory {
  id: string;
  userId: string;
  content: string;
  category: ProtectedCategory;
  sourceMessageId?: string;
  importance: number; // 1-10
  createdAt: string;
  lastAccessed: string;
}

export interface DisposableMemory {
  id: string;
  userId: string;
  content: string;
  summary?: string;
  expiresAt: string;
  createdAt: string;
}

export interface ClassificationResult {
  tier: MemoryTier;
  category?: ProtectedCategory;
  importance?: number;
  cleanedContent: string;
}

// ─── Speech Cleanup ─────────────────────────────────────────────────────────

const FILLER_PATTERNS = [
  /\b(um|uh|er|ah|like|you know|I mean|basically|actually|literally|right|so yeah|anyway)\b/gi,
  /\b(sort of|kind of|I guess|I think maybe)\b/gi,
  /(\w+)\s+\1\b/gi, // repeated words
  /\.\.\.\s*\.\.\./g, // excessive ellipsis
  /\s{2,}/g, // multiple spaces
];

/**
 * Clean speech-to-text artifacts while preserving meaning
 */
export function cleanSpeechInput(text: string): string {
  let cleaned = text;
  for (const pattern of FILLER_PATTERNS) {
    cleaned = cleaned.replace(pattern, (match, ...args) => {
      // For repeated words, keep just one
      if (pattern.source.includes("\\1")) return args[0] || match;
      return "";
    });
  }
  // Collapse multiple spaces and trim
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
  // Fix punctuation spacing
  cleaned = cleaned.replace(/\s+([.,!?;:])/g, "$1");
  return cleaned || text; // fallback to original if cleaning removes everything
}

// ─── AI Classification ──────────────────────────────────────────────────────

/**
 * Classify a message as protected (important) or disposable using AI
 * Returns the tier, category, importance score, and cleaned content
 */
export async function classifyMessage(content: string): Promise<ClassificationResult> {
  const cleaned = cleanSpeechInput(content);

  // Quick heuristic check first (saves LLM calls for obvious cases)
  const quickResult = quickClassify(cleaned);
  if (quickResult) return quickResult;

  // Use LLM for nuanced classification
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You classify messages into memory tiers. Respond ONLY with valid JSON.

PROTECTED (never deleted) — contains ANY of:
- Credentials (API keys, passwords, tokens, URLs)
- Names (people, companies, projects)
- Numbers (phone, account, financial figures, dates)
- Business decisions (agreements, strategies, pivots)
- Deadlines (due dates, milestones, schedules)
- Preferences (user likes/dislikes, style choices)
- Requirements (specs, constraints, must-haves)
- Action items (tasks, todos, commitments)
- Personal info (addresses, relationships, background)
- Project context (architecture decisions, tech stack choices)

DISPOSABLE — ordinary conversation:
- Greetings, small talk
- Thinking out loud without conclusions
- Questions already answered
- Redundant restatements
- Process narration ("let me think about this...")`,
        },
        {
          role: "user",
          content: `Classify this message:\n"${cleaned.slice(0, 500)}"`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "memory_classification",
          strict: true,
          schema: {
            type: "object",
            properties: {
              tier: { type: "string", enum: ["protected", "disposable"] },
              category: {
                type: "string",
                enum: [
                  "credential", "name", "number", "business_decision",
                  "deadline", "preference", "requirement", "action_item",
                  "project_context", "personal_info", "none",
                ],
              },
              importance: { type: "integer", description: "1-10 importance score" },
            },
            required: ["tier", "category", "importance"],
            additionalProperties: false,
          },
        },
      },
    });

    const contentValue = response?.choices?.[0]?.message?.content;
    const contentStr = typeof contentValue === 'string' ? contentValue : JSON.stringify(contentValue || {});
    const parsed = JSON.parse(contentStr || "{}");
    return {
      tier: parsed.tier === "protected" ? "protected" : "disposable",
      category: parsed.tier === "protected" ? (parsed.category as ProtectedCategory) : undefined,
      importance: Math.min(10, Math.max(1, parsed.importance || 5)),
      cleanedContent: cleaned,
    };
  } catch (err) {
    console.warn("[TwoTierMemory] Classification failed, defaulting to disposable:", err);
    return { tier: "disposable", cleanedContent: cleaned };
  }
}

/**
 * Quick heuristic classification (no LLM needed)
 */
function quickClassify(content: string): ClassificationResult | null {
  const lower = content.toLowerCase();

  // Obvious credentials
  if (/(?:api[_-]?key|token|password|secret|bearer)\s*[:=]\s*\S+/i.test(content)) {
    return { tier: "protected", category: "credential", importance: 10, cleanedContent: content };
  }

  // Obvious deadlines
  if (/(?:due|deadline|by|before)\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2}[\/\-]\d{1,2})/i.test(content)) {
    return { tier: "protected", category: "deadline", importance: 8, cleanedContent: content };
  }

  // Phone numbers
  if (/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(content)) {
    return { tier: "protected", category: "number", importance: 7, cleanedContent: content };
  }

  // Email addresses with context
  if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/.test(content) && content.length < 200) {
    return { tier: "protected", category: "personal_info", importance: 7, cleanedContent: content };
  }

  // ─── Identity & Name Detection (CRITICAL for memory recall) ─────────────
  // Patterns: "I'm X", "my name is X", "I am X", "call me X", "this is X", "X here"
  const namePatterns = [
    /(?:i'?m|i am|my name is|call me|this is|it's)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /^([A-Z][a-z]+)\s+here/i,
    /(?:name'?s|they call me)\s+([A-Z][a-z]+)/i,
  ];
  for (const pattern of namePatterns) {
    const nameMatch = content.match(pattern);
    if (nameMatch && nameMatch[1]) {
      const name = nameMatch[1].trim();
      // Avoid matching common non-name words
      const nonNames = ["the", "your", "going", "just", "not", "also", "here", "there", "done", "good", "fine", "sure", "ready"];
      if (!nonNames.includes(name.toLowerCase()) && name.length >= 2 && name.length <= 30) {
        return { tier: "protected", category: "name", importance: 9, cleanedContent: `User's name is ${name}` };
      }
    }
  }

  // Ownership/role declarations: "I'm the owner", "I'm your boss", "I own this"
  if (/(?:i'?m|i am)\s+(?:the\s+)?(?:owner|boss|founder|ceo|creator|admin)/i.test(lower)) {
    return { tier: "protected", category: "personal_info", importance: 9, cleanedContent: content };
  }

  // Preferences: "I prefer", "I like", "I want", "I need"
  if (/(?:i\s+(?:prefer|like|want|need|hate|love|always|never))\s+/i.test(lower) && content.length > 15) {
    return { tier: "protected", category: "preference", importance: 6, cleanedContent: content };
  }

  // Obvious greetings/filler (disposable) — but ONLY if no name/identity info
  if (lower.length < 20 && /^(hi|hello|hey|thanks|ok|sure|got it|sounds good|cool|nice)\s*[.!]?$/.test(lower)) {
    return { tier: "disposable", cleanedContent: content };
  }

  return null; // Needs LLM classification
}

// ─── Storage Operations ─────────────────────────────────────────────────────

/**
 * Store a message in the appropriate tier
 */
export async function storeMemory(
  userId: string,
  content: string,
  classification: ClassificationResult,
  sourceMessageId?: string
): Promise<{ stored: boolean; tier: MemoryTier; id?: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { stored: false, tier: classification.tier };

  if (classification.tier === "protected") {
    const { data, error } = await supabase
      .from("protected_memories")
      .insert({
        user_id: userId,
        content: classification.cleanedContent,
        category: classification.category || "project_context",
        importance: classification.importance || 5,
        source_message_id: sourceMessageId || null,
        last_accessed: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) {
      console.warn("[TwoTierMemory] Protected store failed:", error.message);
      return { stored: false, tier: "protected" };
    }
    return { stored: true, tier: "protected", id: data?.id };
  } else {
    // Disposable: expires after 24 hours by default
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("disposable_memories")
      .insert({
        user_id: userId,
        content: classification.cleanedContent,
        expires_at: expiresAt,
      })
      .select("id")
      .single();

    if (error) {
      console.warn("[TwoTierMemory] Disposable store failed:", error.message);
      return { stored: false, tier: "disposable" };
    }
    return { stored: true, tier: "disposable", id: data?.id };
  }
}

/**
 * Get all protected memories for a user
 */
export async function getProtectedMemories(
  userId: string,
  options?: { category?: ProtectedCategory; limit?: number }
): Promise<ProtectedMemory[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  let query = supabase
    .from("protected_memories")
    .select("*")
    .eq("user_id", userId)
    .order("importance", { ascending: false })
    .order("last_accessed", { ascending: false });

  if (options?.category) query = query.eq("category", options.category);
  if (options?.limit) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error) return [];

  return (data || []).map((row: any) => ({
    id: row.id,
    userId: row.user_id,
    content: row.content,
    category: row.category,
    sourceMessageId: row.source_message_id,
    importance: row.importance,
    createdAt: row.created_at,
    lastAccessed: row.last_accessed,
  }));
}

/**
 * Delete a protected memory
 */
export async function deleteProtectedMemory(userId: string, id: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const { error } = await supabase
    .from("protected_memories")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  return !error;
}

// ─── Garbage Collection ─────────────────────────────────────────────────────

const OUTER_SANDBOX_CAPACITY = 100;

/**
 * Run garbage collection on the outer sandbox (disposable memories)
 * Removes expired entries and compresses oldest when over capacity
 */
export async function runGarbageCollection(userId: string): Promise<{ removed: number; compressed: number }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { removed: 0, compressed: 0 };

  let removed = 0;
  let compressed = 0;

  // 1. Remove expired entries
  const { data: expired } = await supabase
    .from("disposable_memories")
    .delete()
    .eq("user_id", userId)
    .lt("expires_at", new Date().toISOString())
    .select("id");
  removed += expired?.length || 0;

  // 2. Check capacity
  const { count } = await supabase
    .from("disposable_memories")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if ((count || 0) > OUTER_SANDBOX_CAPACITY) {
    const excess = (count || 0) - OUTER_SANDBOX_CAPACITY;
    // Get oldest entries to compress/remove
    const { data: oldest } = await supabase
      .from("disposable_memories")
      .select("id, content")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(excess + 20); // Remove extra to avoid frequent GC

    if (oldest && oldest.length > 0) {
      // Compress: summarize the batch into one entry
      const batchContent = oldest.map((m: any) => m.content).join("\n---\n");
      if (batchContent.length > 200) {
        try {
          const summary = await summarizeForCompression(batchContent);
          // Store compressed summary with longer expiry
          await supabase.from("disposable_memories").insert({
            user_id: userId,
            content: `[COMPRESSED SUMMARY] ${summary}`,
            summary: summary,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          });
          compressed = oldest.length;
        } catch {
          // If compression fails, just delete
        }
      }

      // Delete the original entries
      const idsToDelete = oldest.map((m: any) => m.id);
      await supabase
        .from("disposable_memories")
        .delete()
        .in("id", idsToDelete);
      removed += idsToDelete.length;
    }
  }

  return { removed, compressed };
}

/**
 * Summarize a batch of messages for compression
 */
async function summarizeForCompression(content: string): Promise<string> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: "Summarize this conversation context into a brief paragraph preserving key facts, decisions, and context. Be concise but complete.",
      },
      { role: "user", content: content.slice(0, 3000) },
    ],
  });
  const contentValue = response?.choices?.[0]?.message?.content;
  const contentStr = typeof contentValue === 'string' ? contentValue : JSON.stringify(contentValue || {});
  return contentStr || content.slice(0, 200);
}

// ─── Danger Zone Evacuation ─────────────────────────────────────────────────

/**
 * Evacuate important messages from disposable to protected memory
 * Called when context window is getting thin or approaching limits
 */
export async function evacuateDangerZone(userId: string): Promise<{ evacuated: number }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { evacuated: 0 };

  // Get disposable memories that might be important (longer content, recent)
  const { data: candidates } = await supabase
    .from("disposable_memories")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (!candidates || candidates.length === 0) return { evacuated: 0 };

  let evacuated = 0;

  // Classify each candidate — promote if important
  for (const candidate of candidates) {
    if (candidate.content.length < 20) continue;
    // Skip already-compressed summaries
    if (candidate.content.startsWith("[COMPRESSED")) continue;

    const classification = await classifyMessage(candidate.content);
    if (classification.tier === "protected") {
      // Promote to protected memory
      await supabase.from("protected_memories").insert({
        user_id: userId,
        content: classification.cleanedContent,
        category: classification.category || "project_context",
        importance: classification.importance || 5,
        source_message_id: candidate.id,
        last_accessed: new Date().toISOString(),
      });

      // Remove from disposable
      await supabase
        .from("disposable_memories")
        .delete()
        .eq("id", candidate.id);

      evacuated++;
    }
  }

  return { evacuated };
}

// ─── Memory Recall ──────────────────────────────────────────────────────────

/**
 * Build a context string from protected memories relevant to the current conversation
 * Called at the start of each response to refresh Captain Q's knowledge
 */
export async function recallProtectedMemories(
  userId: string,
  currentMessage?: string
): Promise<string> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return "";

  // Get all protected memories, prioritized by importance and recency
  const { data: memories } = await supabase
    .from("protected_memories")
    .select("*")
    .eq("user_id", userId)
    .order("importance", { ascending: false })
    .order("last_accessed", { ascending: false })
    .limit(20);

  if (!memories || memories.length === 0) return "";

  // Update last_accessed for recalled memories (async, non-blocking)
  const ids = memories.map((m: any) => m.id);
  Promise.resolve(
    supabase
      .from("protected_memories")
      .update({ last_accessed: new Date().toISOString() })
      .in("id", ids)
  ).catch(() => {});
  // Intentionally not awaited for non-blocking behavior

  // Build context string grouped by category
  const grouped: Record<string, string[]> = {};
  for (const mem of memories) {
    const cat = mem.category || "general";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(mem.content);
  }

  const parts: string[] = ["--- Protected Memory (Heaven) ---"];
  for (const [category, items] of Object.entries(grouped)) {
    const label = category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    parts.push(`[${label}]`);
    for (const item of items.slice(0, 5)) {
      parts.push(`  • ${item.slice(0, 200)}`);
    }
  }
  parts.push("--- End Protected Memory ---");

  return parts.join("\n");
}

// ─── Full Pipeline ──────────────────────────────────────────────────────────

/**
 * Process a message through the full two-tier memory pipeline:
 * 1. Clean speech artifacts
 * 2. Classify importance
 * 3. Store in appropriate tier
 * 4. Run GC if needed
 * 
 * Returns whether the message was promoted to protected memory (for UI toast)
 */
export async function processMessageForMemory(
  userId: string,
  content: string,
  sourceMessageId?: string
): Promise<{ promoted: boolean; tier: MemoryTier; category?: ProtectedCategory }> {
  // Skip very short messages
  if (content.length < 10) {
    return { promoted: false, tier: "disposable" };
  }

  const classification = await classifyMessage(content);
  const result = await storeMemory(userId, content, classification, sourceMessageId);

  // Run GC in background (non-blocking)
  runGarbageCollection(userId).catch(() => {});

  return {
    promoted: classification.tier === "protected",
    tier: classification.tier,
    category: classification.category,
  };
}
