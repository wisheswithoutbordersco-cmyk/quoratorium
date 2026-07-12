/**
 * Knowledge Base Service — pgvector-powered RAG with semantic search
 * Uses Supabase as the vector store. Gracefully degrades if Supabase is unavailable.
 */
import { getSupabaseAdmin } from "./supabase";
import { invokeLLM } from "./_core/llm";

export interface KnowledgeEntry {
  id?: string;
  userId: string;
  title: string;
  content: string;
  embedding?: number[];
  metadata?: Record<string, any>;
  source?: string;
  chunkIndex?: number;
  createdAt?: string;
}

export interface SearchResult {
  id: string;
  userId: string;
  title: string;
  content: string;
  metadata: Record<string, any>;
  similarity: number;
}

/**
 * Generate an embedding for text using the LLM service
 */
async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const forgeUrl = (process.env.BUILT_IN_FORGE_API_URL || "").replace(/\/+$/, "");
    const forgeKey = process.env.BUILT_IN_FORGE_API_KEY;

    if (!forgeUrl || !forgeKey) return null;

    const resp = await fetch(`${forgeUrl}/v1/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${forgeKey}`,
      },
      body: JSON.stringify({
        input: text.substring(0, 8000), // Limit input length
        model: "text-embedding-3-small",
      }),
    });

    if (!resp.ok) return null;

    const data = (await resp.json()) as any;
    return data?.data?.[0]?.embedding || null;
  } catch {
    return null;
  }
}

/**
 * Add a knowledge entry with auto-generated embedding
 */
export async function addKnowledgeEntry(entry: KnowledgeEntry): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { success: false, error: "Supabase not configured" };

  try {
    // Generate embedding from content
    const embedding = await generateEmbedding(`${entry.title}\n\n${entry.content}`);

    const { data, error } = await supabase
      .from("knowledge_base")
      .insert({
        user_id: entry.userId,
        title: entry.title,
        content: entry.content,
        embedding: embedding,
        metadata: entry.metadata || {},
        source: entry.source || "manual",
        chunk_index: entry.chunkIndex || 0,
      })
      .select("id")
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, id: data?.id };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Add multiple knowledge entries (for chunked documents)
 */
export async function addKnowledgeEntries(entries: KnowledgeEntry[]): Promise<{ success: boolean; count: number; error?: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { success: false, count: 0, error: "Supabase not configured" };

  try {
    const rows = await Promise.all(
      entries.map(async (entry, idx) => {
        const embedding = await generateEmbedding(`${entry.title}\n\n${entry.content}`);
        return {
          user_id: entry.userId,
          title: entry.title,
          content: entry.content,
          embedding,
          metadata: entry.metadata || {},
          source: entry.source || "manual",
          chunk_index: entry.chunkIndex ?? idx,
        };
      })
    );

    const { error } = await supabase.from("knowledge_base").insert(rows);
    if (error) return { success: false, count: 0, error: error.message };
    return { success: true, count: rows.length };
  } catch (err: any) {
    return { success: false, count: 0, error: err.message };
  }
}

/**
 * Semantic search using pgvector similarity
 */
export async function searchKnowledge(
  userId: string,
  query: string,
  options: { threshold?: number; limit?: number } = {}
): Promise<SearchResult[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { threshold = 0.7, limit = 5 } = options;

  try {
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);
    if (!queryEmbedding) return [];

    // Use the match_knowledge function if available
    const { data, error } = await supabase.rpc("match_knowledge", {
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: limit,
      filter_user_id: userId,
    });

    if (error) {
      // Fallback: try a basic text search if pgvector function isn't available
      console.warn("[KnowledgeBase] pgvector search failed, falling back to text search:", error.message);
      return await textSearchFallback(userId, query, limit);
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      title: row.title,
      content: row.content,
      metadata: row.metadata || {},
      similarity: row.similarity,
    }));
  } catch (err) {
    console.error("[KnowledgeBase] Search error:", err);
    return [];
  }
}

/**
 * Fallback text search when pgvector is not available
 */
async function textSearchFallback(userId: string, query: string, limit: number): Promise<SearchResult[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from("knowledge_base")
      .select("id, user_id, title, content, metadata")
      .eq("user_id", userId)
      .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
      .limit(limit);

    if (error) return [];

    return (data || []).map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      title: row.title,
      content: row.content,
      metadata: row.metadata || {},
      similarity: 0.5, // Approximate similarity for text search
    }));
  } catch {
    return [];
  }
}

/**
 * Get all knowledge entries for a user
 */
export async function getUserKnowledge(
  userId: string,
  options: { limit?: number; offset?: number; source?: string } = {}
): Promise<{ entries: KnowledgeEntry[]; total: number }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { entries: [], total: 0 };

  const { limit = 50, offset = 0, source } = options;

  try {
    let query = supabase
      .from("knowledge_base")
      .select("id, user_id, title, content, metadata, source, chunk_index, created_at", { count: "exact" })
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (source) {
      query = query.eq("source", source);
    }

    const { data, error, count } = await query;

    if (error) return { entries: [], total: 0 };

    const entries: KnowledgeEntry[] = (data || []).map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      title: row.title,
      content: row.content,
      metadata: row.metadata,
      source: row.source,
      chunkIndex: row.chunk_index,
      createdAt: row.created_at,
    }));

    return { entries, total: count || 0 };
  } catch {
    return { entries: [], total: 0 };
  }
}

/**
 * Delete a knowledge entry
 */
export async function deleteKnowledgeEntry(userId: string, entryId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  try {
    const { error } = await supabase
      .from("knowledge_base")
      .delete()
      .eq("id", entryId)
      .eq("user_id", userId);

    return !error;
  } catch {
    return false;
  }
}

/**
 * Delete all knowledge entries for a user
 */
export async function clearUserKnowledge(userId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  try {
    const { error } = await supabase
      .from("knowledge_base")
      .delete()
      .eq("user_id", userId);

    return !error;
  } catch {
    return false;
  }
}

/**
 * Get RAG context for a conversation query
 * This is the main entry point used by Captain Q to augment responses
 */
export async function getRAGContext(userId: string, query: string): Promise<string> {
  const results = await searchKnowledge(userId, query, { threshold: 0.65, limit: 3 });

  if (results.length === 0) return "";

  const contextParts = results.map(
    (r, i) => `[Knowledge ${i + 1}] (relevance: ${(r.similarity * 100).toFixed(0)}%)\nTitle: ${r.title}\n${r.content}`
  );

  return `\n--- Relevant Knowledge Base Context ---\n${contextParts.join("\n\n")}\n--- End Knowledge Context ---\n`;
}
