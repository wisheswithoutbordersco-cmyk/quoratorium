/**
 * CAPTAIN Q — Memory Service
 *
 * Handles:
 *   1. Generating embeddings for messages (via OpenAI text-embedding-3-small)
 *   2. Saving messages to conversation_memory with embeddings
 *   3. Retrieving relevant past context before Q responds
 *   4. Storing and retrieving knowledge (facts, preferences)
 *   5. Creating session summaries
 *
 * Env vars needed:
 *   OPENAI_API_KEY or OPENROUTER_API_KEY (for embeddings)
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY
 */

import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

// ─── Config ─────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Use OpenAI directly for embeddings (OpenRouter doesn't support embeddings)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
});

// ─── Embedding Generation ──────────────────────────────
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000), // Truncate to stay within token limits
    });
    return response.data[0].embedding;
  } catch (error: any) {
    console.error('[Memory] Embedding generation failed:', error?.message);
    return []; // Return empty array on failure — message still saves, just without vector
  }
}

// ─── Save Message to Memory ────────────────────────────
export async function saveToMemory(params: {
  userId: number;
  conversationId?: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: Record<string, any>;
}): Promise<void> {
  const { userId, conversationId, role, content, metadata } = params;

  // Skip very short messages (greetings, "ok", etc.)
  if (content.length < 10) return;

  try {
    // Generate embedding for semantic search
    const embedding = await generateEmbedding(content);

    // Generate a short summary for quick retrieval
    const summary = content.length > 200
      ? content.slice(0, 200) + '...'
      : content;

    const insertData: any = {
      user_id: userId,
      conversation_id: conversationId || null,
      role,
      content,
      summary,
      metadata: metadata || {},
    };

    // Only include embedding if generation succeeded
    if (embedding.length > 0) {
      insertData.embedding = JSON.stringify(embedding);
    }

    const { error } = await supabase
      .from('conversation_memory')
      .insert(insertData);

    if (error) {
      console.error('[Memory] Failed to save message:', error.message);
    }
  } catch (error: any) {
    // Non-blocking — don't crash chat if memory fails
    console.error('[Memory] Save failed:', error?.message);
  }
}

// ─── Retrieve Relevant Context ─────────────────────────
export async function getRelevantContext(params: {
  userId: number;
  query: string;
  maxResults?: number;
  threshold?: number;
}): Promise<string> {
  const { userId, query, maxResults = 5, threshold = 0.7 } = params;

  try {
    const embedding = await generateEmbedding(query);
    if (embedding.length === 0) return '';

    // Call the search_memory function we created in the migration
    const { data, error } = await supabase.rpc('search_memory', {
      query_embedding: JSON.stringify(embedding),
      match_user_id: userId,
      match_count: maxResults,
      similarity_threshold: threshold,
    });

    if (error || !data || data.length === 0) return '';

    // Format context for the AI
    const contextParts = data.map((item: any) => {
      const timeAgo = getTimeAgo(new Date(item.created_at));
      return `[${timeAgo}] ${item.role}: ${item.content}`;
    });

    return `\n--- Relevant Past Context ---\n${contextParts.join('\n')}\n--- End Context ---\n`;
  } catch (error: any) {
    console.error('[Memory] Context retrieval failed:', error?.message);
    return '';
  }
}

// ─── Knowledge Base Operations ─────────────────────────

export async function saveKnowledge(params: {
  userId: number;
  category: string;
  key: string;
  value: string;
  source?: string;
  confidence?: number;
}): Promise<void> {
  const { userId, category, key, value, source, confidence } = params;

  try {
    const embedding = await generateEmbedding(`${category}: ${key} = ${value}`);

    const insertData: any = {
      user_id: userId,
      category,
      key,
      value,
      source: source || 'conversation',
      confidence: confidence || 1.0,
      last_confirmed: new Date().toISOString(),
    };

    if (embedding.length > 0) {
      insertData.embedding = JSON.stringify(embedding);
    }

    // Upsert — update if exists, insert if new
    const { error } = await supabase
      .from('knowledge_base')
      .upsert(insertData, { onConflict: 'user_id,category,key' });

    if (error) {
      console.error('[Memory] Knowledge save failed:', error.message);
    }
  } catch (error: any) {
    console.error('[Memory] Knowledge save failed:', error?.message);
  }
}

export async function getRelevantKnowledge(params: {
  userId: number;
  query: string;
  maxResults?: number;
}): Promise<string> {
  const { userId, query, maxResults = 5 } = params;

  try {
    const embedding = await generateEmbedding(query);
    if (embedding.length === 0) return '';

    const { data, error } = await supabase.rpc('search_knowledge', {
      query_embedding: JSON.stringify(embedding),
      match_user_id: userId,
      match_count: maxResults,
      similarity_threshold: 0.6,
    });

    if (error || !data || data.length === 0) return '';

    const knowledgeParts = data.map((item: any) =>
      `• ${item.category}/${item.key}: ${item.value}`
    );

    return `\n--- Known Facts ---\n${knowledgeParts.join('\n')}\n--- End Facts ---\n`;
  } catch (error: any) {
    console.error('[Memory] Knowledge retrieval failed:', error?.message);
    return '';
  }
}

// ─── Session Summary ───────────────────────────────────

export async function saveSessionSummary(params: {
  userId: number;
  conversationId?: number;
  summary: string;
  keyTopics: string[];
  actionItems: string[];
  decisionsMade: string[];
  messageCount: number;
  sessionStart: Date;
  sessionEnd: Date;
}): Promise<void> {
  try {
    const embedding = await generateEmbedding(params.summary);

    const insertData: any = {
      user_id: params.userId,
      conversation_id: params.conversationId || null,
      summary: params.summary,
      key_topics: params.keyTopics,
      action_items: params.actionItems,
      decisions_made: params.decisionsMade,
      message_count: params.messageCount,
      session_start: params.sessionStart.toISOString(),
      session_end: params.sessionEnd.toISOString(),
    };

    if (embedding.length > 0) {
      insertData.embedding = JSON.stringify(embedding);
    }

    const { error } = await supabase
      .from('session_summaries')
      .insert(insertData);

    if (error) {
      console.error('[Memory] Session summary save failed:', error.message);
    }
  } catch (error: any) {
    console.error('[Memory] Session summary save failed:', error?.message);
  }
}

// ─── Build Context for Captain Q ───────────────────────
// This is the main function called before Q responds
export async function buildMemoryContext(userId: number, currentMessage: string): Promise<string> {
  let context = '';

  // Get relevant past conversations
  const pastContext = await getRelevantContext({
    userId,
    query: currentMessage,
    maxResults: 5,
    threshold: 0.72,
  });

  // Get relevant knowledge/facts
  const knowledge = await getRelevantKnowledge({
    userId,
    query: currentMessage,
    maxResults: 3,
  });

  if (knowledge) context += knowledge;
  if (pastContext) context += pastContext;

  return context;
}

// ─── Utility ───────────────────────────────────────────
function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return `${Math.floor(seconds / 604800)}w ago`;
}
