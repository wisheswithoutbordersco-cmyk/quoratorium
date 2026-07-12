/**
 * RAG Service — Retrieval-Augmented Generation Pipeline (Supabase)
 */
import { getSupabaseAdmin } from "./supabase";

function getDb() {
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Database not initialized");
  return client;
}

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;
const CHUNK_SIZE_TOKENS = 500;
const CHUNK_OVERLAP_TOKENS = 50;
const DEFAULT_TOP_K = 5;
const SIMILARITY_THRESHOLD = 0.3;

// ─── Text Chunking ──────────────────────────────────────────────────────────

export function chunkText(
  text: string,
  chunkSizeTokens = CHUNK_SIZE_TOKENS,
  overlapTokens = CHUNK_OVERLAP_TOKENS
): Array<{ content: string; startChar: number; endChar: number; tokenCount: number }> {
  const charsPerToken = 4;
  const chunkSizeChars = chunkSizeTokens * charsPerToken;
  const overlapChars = overlapTokens * charsPerToken;

  const chunks: Array<{ content: string; startChar: number; endChar: number; tokenCount: number }> = [];
  if (!text || text.trim().length === 0) return chunks;

  const paragraphs = text.split(/\n\s*\n/);
  let currentChunk = "";
  let currentStart = 0;
  let charOffset = 0;

  for (const paragraph of paragraphs) {
    const paragraphWithSep = paragraph + "\n\n";

    if (currentChunk.length + paragraphWithSep.length > chunkSizeChars && currentChunk.length > 0) {
      chunks.push({
        content: currentChunk.trim(),
        startChar: currentStart,
        endChar: currentStart + currentChunk.length,
        tokenCount: Math.ceil(currentChunk.length / charsPerToken),
      });
      const overlap = currentChunk.slice(-overlapChars);
      currentStart = charOffset - overlap.length;
      currentChunk = overlap + paragraphWithSep;
    } else {
      if (currentChunk.length === 0) currentStart = charOffset;
      currentChunk += paragraphWithSep;
    }
    charOffset += paragraphWithSep.length;
  }

  if (currentChunk.trim().length > 0) {
    chunks.push({
      content: currentChunk.trim(),
      startChar: currentStart,
      endChar: currentStart + currentChunk.length,
      tokenCount: Math.ceil(currentChunk.length / charsPerToken),
    });
  }

  // Split oversized chunks by sentences
  const result: typeof chunks = [];
  for (const chunk of chunks) {
    if (chunk.content.length > chunkSizeChars * 1.5) {
      const sentences = chunk.content.split(/(?<=[.!?])\s+/);
      let subChunk = "";
      let subStart = chunk.startChar;
      for (const sentence of sentences) {
        if (subChunk.length + sentence.length > chunkSizeChars && subChunk.length > 0) {
          result.push({
            content: subChunk.trim(),
            startChar: subStart,
            endChar: subStart + subChunk.length,
            tokenCount: Math.ceil(subChunk.length / charsPerToken),
          });
          const overlap = subChunk.slice(-overlapChars);
          subStart = subStart + subChunk.length - overlap.length;
          subChunk = overlap + sentence + " ";
        } else {
          subChunk += sentence + " ";
        }
      }
      if (subChunk.trim().length > 0) {
        result.push({
          content: subChunk.trim(),
          startChar: subStart,
          endChar: subStart + subChunk.length,
          tokenCount: Math.ceil(subChunk.length / charsPerToken),
        });
      }
    } else {
      result.push(chunk);
    }
  }
  return result;
}

// ─── Embedding Generation ───────────────────────────────────────────────────

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for embedding generation");

  const batchSize = 100;
  const allEmbeddings: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: batch, dimensions: EMBEDDING_DIMENSIONS }),
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI embedding API error: ${response.status} — ${error}`);
    }
    const data = await response.json() as { data: Array<{ embedding: number[] }> };
    allEmbeddings.push(...data.data.map(d => d.embedding));
  }
  return allEmbeddings;
}

export async function generateQueryEmbedding(query: string): Promise<number[]> {
  const [embedding] = await generateEmbeddings([query]);
  return embedding;
}

// ─── Cosine Similarity ──────────────────────────────────────────────────────

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

// ─── Document Ingestion ─────────────────────────────────────────────────────

export function extractText(content: string | Buffer, mimeType: string): string {
  if (mimeType.startsWith("text/") || mimeType === "application/json" || mimeType === "application/javascript" || mimeType === "application/typescript") {
    return typeof content === "string" ? content : content.toString("utf-8");
  }
  if (mimeType === "text/markdown" || mimeType === "text/x-markdown") {
    return typeof content === "string" ? content : content.toString("utf-8");
  }
  if (mimeType === "application/pdf") {
    const str = typeof content === "string" ? content : content.toString("utf-8");
    return str.replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s+/g, " ").trim();
  }
  return typeof content === "string" ? content : content.toString("utf-8");
}

export async function ingestDocument(
  userId: number,
  filename: string,
  content: string,
  mimeType: string,
  fileSize: number,
  storageKey?: string
): Promise<{ documentId: number; chunkCount: number }> {
  const db = getDb();

  const { data: doc, error: docErr } = await db.from("documents").insert({
    user_id: userId,
    filename,
    mime_type: mimeType,
    file_size: fileSize,
    status: "indexing",
    storage_key: storageKey || null,
    chunk_count: 0,
  }).select("id").single();

  if (docErr || !doc) throw new Error("Failed to create document record");
  const documentId = doc.id;

  try {
    const textChunks = chunkText(content);
    if (textChunks.length === 0) {
      await db.from("documents").update({ status: "error", error_message: "No content could be extracted" }).eq("id", documentId);
      return { documentId, chunkCount: 0 };
    }

    const chunkTexts = textChunks.map(c => c.content);
    const embeddings = await generateEmbeddings(chunkTexts);

    const chunkValues = textChunks.map((chunk, index) => ({
      document_id: documentId,
      user_id: userId,
      content: chunk.content,
      chunk_index: index,
      token_count: chunk.tokenCount,
      embedding: JSON.stringify(embeddings[index]),
      metadata: JSON.stringify({ startChar: chunk.startChar, endChar: chunk.endChar, filename }),
    }));

    // Insert in batches of 50
    for (let i = 0; i < chunkValues.length; i += 50) {
      const batch = chunkValues.slice(i, i + 50);
      await db.from("chunks").insert(batch);
    }

    await db.from("documents").update({ status: "ready", chunk_count: textChunks.length }).eq("id", documentId);
    return { documentId, chunkCount: textChunks.length };
  } catch (error: any) {
    await db.from("documents").update({ status: "error", error_message: error?.message || "Ingestion failed" }).eq("id", documentId);
    throw error;
  }
}

// ─── Semantic Search ────────────────────────────────────────────────────────

export interface SearchResult {
  chunkId: number;
  documentId: number;
  filename: string;
  content: string;
  similarity: number;
  metadata: any;
}

export async function semanticSearch(
  userId: number,
  query: string,
  topK = DEFAULT_TOP_K,
  threshold = SIMILARITY_THRESHOLD
): Promise<SearchResult[]> {
  const queryEmbedding = await generateQueryEmbedding(query);
  const db = getDb();

  const { data: userChunks } = await db
    .from("chunks")
    .select("id, document_id, content, embedding, metadata")
    .eq("user_id", userId);

  const { data: userDocs } = await db
    .from("documents")
    .select("id, filename")
    .eq("user_id", userId)
    .eq("status", "ready");

  const docMap = new Map((userDocs || []).map(d => [d.id, d.filename]));

  const scored: SearchResult[] = [];
  for (const chunk of userChunks || []) {
    if (!chunk.embedding) continue;
    let chunkEmbedding: number[];
    try {
      chunkEmbedding = JSON.parse(chunk.embedding);
    } catch { continue; }

    const similarity = cosineSimilarity(queryEmbedding, chunkEmbedding);
    if (similarity >= threshold) {
      scored.push({
        chunkId: chunk.id,
        documentId: chunk.document_id,
        filename: docMap.get(chunk.document_id) || "Unknown",
        content: chunk.content,
        similarity,
        metadata: chunk.metadata,
      });
    }
  }

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, topK);
}

// ─── Knowledge Context Builder ──────────────────────────────────────────────

export function buildKnowledgeContext(results: SearchResult[]): string {
  if (results.length === 0) return "";
  const contextParts = results.map(r => `[Source: ${r.filename} | Relevance: ${(r.similarity * 100).toFixed(0)}%]\n${r.content}`);
  return `\n\n--- KNOWLEDGE BASE CONTEXT ---\nThe following information was retrieved from the user's knowledge base:\n\n${contextParts.join("\n\n---\n\n")}\n--- END KNOWLEDGE BASE CONTEXT ---\n`;
}

// ─── Document Management ────────────────────────────────────────────────────

export async function deleteDocument(userId: number, documentId: number): Promise<boolean> {
  const db = getDb();
  const { data: doc } = await db.from("documents").select("id").eq("id", documentId).eq("user_id", userId).single();
  if (!doc) return false;

  await db.from("chunks").delete().eq("document_id", documentId);
  await db.from("documents").delete().eq("id", documentId);
  return true;
}

export async function getUserDocuments(userId: number) {
  const db = getDb();
  const { data } = await db.from("documents").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  return data || [];
}

export async function getKnowledgeStats(userId: number) {
  const db = getDb();
  const { data: docs } = await db.from("documents").select("*").eq("user_id", userId);
  const allDocs = docs || [];
  const totalDocuments = allDocs.length;
  const totalChunks = allDocs.reduce((sum, d) => sum + (d.chunk_count || 0), 0);
  const totalSize = allDocs.reduce((sum, d) => sum + (d.file_size || 0), 0);
  const readyDocs = allDocs.filter(d => d.status === "ready").length;
  const indexingDocs = allDocs.filter(d => d.status === "indexing").length;
  const errorDocs = allDocs.filter(d => d.status === "error").length;
  return { totalDocuments, totalChunks, totalSizeBytes: totalSize, readyDocuments: readyDocs, indexingDocuments: indexingDocs, errorDocuments: errorDocs };
}
