/**
 * Agent Memory Service — intelligent memory retrieval, creation, and auto-learning (Supabase)
 */
import { getSupabaseAdmin } from "./supabase";

function getDb() {
  return getSupabaseAdmin();
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface MemoryEntry {
  id: number;
  user_id: number;
  category: string;
  title: string;
  content: string;
  tags: string[] | null;
  importance: number;
  source: string;
  related_project_id: number | null;
  use_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

// Re-export for backward compat
export type { MemoryEntry };

// ─── Memory Retrieval ──────────────────────────────────────────────────────

export async function retrieveRelevantMemories(
  userId: number,
  query: string,
  options: { limit?: number; projectId?: number | null } = {}
): Promise<{ memories: MemoryEntry[]; count: number }> {
  const db = getDb();
  if (!db) return { memories: [], count: 0 };

  const limit = options.limit || 8;

  const { data: allMemories } = await db
    .from("memory_entries")
    .select("*")
    .eq("user_id", userId)
    .order("importance", { ascending: false });

  if (!allMemories || allMemories.length === 0) return { memories: [], count: 0 };

  // Score each memory by keyword relevance
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const scored = allMemories.map((memory: MemoryEntry) => {
    let score = 0;
    const memoryText = `${memory.title} ${memory.content}`.toLowerCase();
    const tags = (memory.tags as string[] | null) || [];

    for (const word of queryWords) {
      if (memoryText.includes(word)) score += 2;
      if (tags.some(t => t.toLowerCase().includes(word))) score += 3;
    }

    score *= (memory.importance / 5);

    if (memory.category === "correction") score += 5;
    if (memory.category === "preference") score += 3;

    if (options.projectId && memory.related_project_id === options.projectId) score += 4;

    if (memory.last_used_at) {
      const daysSinceUse = (Date.now() - new Date(memory.last_used_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceUse < 7) score += 1;
    }

    return { memory, score };
  });

  const relevant = scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // Always include high-importance corrections and preferences
  const criticalMemories = allMemories.filter((m: MemoryEntry) =>
    (m.category === "correction" || m.category === "preference") &&
    m.importance >= 8 &&
    !relevant.some(r => r.memory.id === m.id)
  ).slice(0, 3);

  const finalMemories = [
    ...criticalMemories.map((m: MemoryEntry) => ({ memory: m, score: 10 })),
    ...relevant,
  ].slice(0, limit);

  // Update usage tracking
  const memoryIds = finalMemories.map(m => m.memory.id);
  if (memoryIds.length > 0) {
    for (const id of memoryIds) {
      void (async () => {
        try {
          await db.from("memory_entries")
            .update({ use_count: (finalMemories.find(f => f.memory.id === id)?.memory.use_count || 0) + 1, last_used_at: new Date().toISOString() })
            .eq("id", id);
        } catch {}
      })();
    }
  }

  return {
    memories: finalMemories.map(m => m.memory),
    count: finalMemories.length,
  };
}

/**
 * Build a memory context string to inject into the Captain system prompt
 */
export function buildMemoryContext(memories: MemoryEntry[]): string {
  if (memories.length === 0) return "";

  const sections: string[] = [];
  sections.push("\n\n--- AGENT MEMORY (Context from previous sessions) ---");

  const grouped: Record<string, MemoryEntry[]> = {};
  for (const m of memories) {
    const cat = m.category || "context";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(m);
  }

  if (grouped["correction"]) {
    sections.push("\n[CORRECTIONS - Always follow these]");
    for (const m of grouped["correction"]) {
      sections.push(`• ${m.title}: ${m.content}`);
    }
  }

  if (grouped["preference"]) {
    sections.push("\n[USER PREFERENCES]");
    for (const m of grouped["preference"]) {
      sections.push(`• ${m.title}: ${m.content}`);
    }
  }

  if (grouped["fact"]) {
    sections.push("\n[KNOWN FACTS]");
    for (const m of grouped["fact"]) {
      sections.push(`• ${m.title}: ${m.content}`);
    }
  }

  if (grouped["instruction"]) {
    sections.push("\n[STANDING INSTRUCTIONS]");
    for (const m of grouped["instruction"]) {
      sections.push(`• ${m.title}: ${m.content}`);
    }
  }

  const contextEntries = [...(grouped["context"] || []), ...(grouped["insight"] || []), ...(grouped["project_summary"] || [])];
  if (contextEntries.length > 0) {
    sections.push("\n[CONTEXT & INSIGHTS]");
    for (const m of contextEntries) {
      sections.push(`• ${m.title}: ${m.content}`);
    }
  }

  sections.push("\n--- END MEMORY ---\n");
  sections.push("Use these memories naturally in your responses. Reference them when relevant.");

  return sections.join("\n");
}

// ─── Auto-Learning / Memory Extraction ─────────────────────────────────────

const CORRECTION_PATTERNS = [
  /no[,.]?\s*(actually|instead|don'?t|never|always|use|prefer|I want|I need|I like)/i,
  /wrong[,.]?\s*(use|do|make|try)/i,
  /not like that/i,
  /I prefer/i,
  /I always want/i,
  /don'?t ever/i,
  /never use/i,
  /always use/i,
  /change it to/i,
  /from now on/i,
  /remember (this|that)/i,
];

const FACT_PATTERNS = [
  /my (name|company|business|project|website|app|team|stack) is/i,
  /I (am|work|run|own|manage|build|use)/i,
  /we (are|use|prefer|build|deploy)/i,
  /our (stack|team|company|product|service)/i,
];

const PREFERENCE_PATTERNS = [
  /I (prefer|like|want|love|hate|dislike|always use)/i,
  /my (preferred|favorite|default|go-to)/i,
  /use .+ (instead of|over|rather than)/i,
  /always (use|include|add|make)/i,
];

export function extractMemoriesFromMessage(
  message: string,
  _assistantResponse?: string
): Array<{ title: string; content: string; category: string; importance: number; source: string }> {
  const extracted: Array<{ title: string; content: string; category: string; importance: number; source: string }> = [];

  const rememberMatch = message.match(/remember (this|that)[:\s]*(.*)/i);
  if (rememberMatch && rememberMatch[2]) {
    extracted.push({
      title: "User instruction",
      content: rememberMatch[2].trim(),
      category: "instruction",
      importance: 8,
      source: "auto_extracted",
    });
  }

  for (const pattern of CORRECTION_PATTERNS) {
    if (pattern.test(message)) {
      extracted.push({
        title: "User correction",
        content: message.slice(0, 500),
        category: "correction",
        importance: 9,
        source: "correction",
      });
      break;
    }
  }

  for (const pattern of FACT_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      const sentences = message.split(/[.!?]+/);
      const factSentence = sentences.find(s => pattern.test(s));
      if (factSentence && factSentence.trim().length > 10) {
        extracted.push({
          title: "User fact",
          content: factSentence.trim().slice(0, 500),
          category: "fact",
          importance: 6,
          source: "auto_extracted",
        });
        break;
      }
    }
  }

  for (const pattern of PREFERENCE_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      const sentences = message.split(/[.!?]+/);
      const prefSentence = sentences.find(s => pattern.test(s));
      if (prefSentence && prefSentence.trim().length > 10) {
        extracted.push({
          title: "User preference",
          content: prefSentence.trim().slice(0, 500),
          category: "preference",
          importance: 7,
          source: "auto_extracted",
        });
        break;
      }
    }
  }

  return extracted;
}

export async function persistExtractedMemories(
  userId: number,
  extracted: Array<{ title: string; content: string; category: string; importance: number; source: string }>,
  projectId?: number | null
): Promise<number> {
  const db = getDb();
  if (!db || extracted.length === 0) return 0;

  let stored = 0;
  for (const entry of extracted) {
    try {
      await db.from("memory_entries").insert({
        user_id: userId,
        title: entry.title,
        content: entry.content,
        category: entry.category,
        importance: entry.importance,
        source: entry.source,
        related_project_id: projectId || null,
        tags: null,
      });
      stored++;
    } catch (err) {
      console.warn("[Memory] Failed to persist extracted memory:", err);
    }
  }
  return stored;
}

// ─── Memory Management ─────────────────────────────────────────────────────

export async function updateMemoryEntry(
  id: number,
  userId: number,
  data: Partial<{ title: string; content: string; category: string; importance: number; tags: string[] | null }>
): Promise<MemoryEntry | null> {
  const db = getDb();
  if (!db) return null;

  await db.from("memory_entries").update(data).eq("id", id).eq("user_id", userId);

  const { data: row } = await db.from("memory_entries").select("*").eq("id", id).eq("user_id", userId).single();
  return row || null;
}

export async function getMemoryStats(userId: number): Promise<{
  total: number;
  byCategory: Record<string, number>;
  recentlyUsed: number;
  highImportance: number;
}> {
  const db = getDb();
  if (!db) return { total: 0, byCategory: {}, recentlyUsed: 0, highImportance: 0 };

  const { data: all } = await db.from("memory_entries").select("*").eq("user_id", userId);

  const byCategory: Record<string, number> = {};
  let recentlyUsed = 0;
  let highImportance = 0;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  for (const m of all || []) {
    byCategory[m.category] = (byCategory[m.category] || 0) + 1;
    if (m.last_used_at && new Date(m.last_used_at).getTime() > weekAgo) recentlyUsed++;
    if (m.importance >= 8) highImportance++;
  }

  return { total: (all || []).length, byCategory, recentlyUsed, highImportance };
}
