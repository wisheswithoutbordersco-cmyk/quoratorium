/**
 * Patent 3: Anti-Loop Heartbeat Interrupt
 * 
 * Monitors Captain Q's generation in real-time:
 * - Heartbeat check every ~500 tokens
 * - Loop detection via similarity scoring
 * - Corrective actions: re-inject prompt, reset, or graceful stop
 * - Progress tracking with adaptive timing
 * 
 * Integrates into the streaming pipeline to intercept token output.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface HeartbeatState {
  tokenCount: number;
  chunks: string[]; // Rolling window of recent output chunks
  checkInterval: number; // Tokens between checks (adaptive)
  lastCheckAt: number; // Token count at last check
  loopCount: number; // Number of loop detections
  originalPrompt: string;
  isHealthy: boolean;
  progressMilestones: string[];
}

export interface HeartbeatCheckResult {
  healthy: boolean;
  loopDetected: boolean;
  similarity: number; // 0-1 similarity to previous chunks
  driftDetected: boolean;
  action: "continue" | "warn" | "inject_reminder" | "stop";
  message?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_CHECK_INTERVAL = 500; // tokens
const MIN_CHECK_INTERVAL = 200; // tokens (when loop indicators appear)
const MAX_CHECK_INTERVAL = 1000; // tokens (when flowing well)
const SIMILARITY_THRESHOLD = 0.80; // 80% similarity = potential loop
const CHUNK_WINDOW_SIZE = 5; // Number of chunks to keep in rolling window
const CHUNK_SIZE = 100; // Characters per chunk for comparison

// ─── Heartbeat Monitor ──────────────────────────────────────────────────────

/**
 * Create a new heartbeat state for a generation session
 */
export function createHeartbeatState(originalPrompt: string): HeartbeatState {
  return {
    tokenCount: 0,
    chunks: [],
    checkInterval: DEFAULT_CHECK_INTERVAL,
    lastCheckAt: 0,
    loopCount: 0,
    originalPrompt,
    isHealthy: true,
    progressMilestones: [],
  };
}

/**
 * Feed tokens to the heartbeat monitor
 * Returns a check result if a heartbeat check was triggered, null otherwise
 */
export function feedTokens(
  state: HeartbeatState,
  newContent: string
): HeartbeatCheckResult | null {
  state.tokenCount += estimateTokens(newContent);

  // Accumulate content into chunks
  const lastChunk = state.chunks[state.chunks.length - 1] || "";
  if (lastChunk.length < CHUNK_SIZE) {
    state.chunks[state.chunks.length - 1] = lastChunk + newContent;
  } else {
    state.chunks.push(newContent);
  }

  // Keep rolling window
  if (state.chunks.length > CHUNK_WINDOW_SIZE * 2) {
    state.chunks = state.chunks.slice(-CHUNK_WINDOW_SIZE);
  }

  // Check if it's time for a heartbeat
  if (state.tokenCount - state.lastCheckAt >= state.checkInterval) {
    state.lastCheckAt = state.tokenCount;
    return runHeartbeatCheck(state);
  }

  return null;
}

/**
 * Run a heartbeat check on the current generation state
 */
function runHeartbeatCheck(state: HeartbeatState): HeartbeatCheckResult {
  // Need at least 3 chunks to compare
  if (state.chunks.length < 3) {
    return { healthy: true, loopDetected: false, similarity: 0, driftDetected: false, action: "continue" };
  }

  // Compare recent chunks for repetition
  const similarity = detectRepetition(state.chunks);
  const loopDetected = similarity > SIMILARITY_THRESHOLD;

  // Check for drift from original prompt
  const driftDetected = detectDrift(state);

  // Determine action
  let action: HeartbeatCheckResult["action"] = "continue";
  let message: string | undefined;

  if (loopDetected) {
    state.loopCount++;

    if (state.loopCount >= 3) {
      // Third loop detection — stop generation
      action = "stop";
      message = "I noticed I was repeating myself. Here's the clean version:";
      state.isHealthy = false;
    } else if (state.loopCount >= 2) {
      // Second detection — inject reminder
      action = "inject_reminder";
      message = `[SYSTEM: You are repeating yourself. Refocus on the original request: "${state.originalPrompt.slice(0, 100)}"]`;
    } else {
      // First detection — warn (shorten interval)
      action = "warn";
      state.checkInterval = MIN_CHECK_INTERVAL;
    }
  } else if (driftDetected) {
    action = "inject_reminder";
    message = `[SYSTEM: Stay focused on: "${state.originalPrompt.slice(0, 100)}"]`;
  } else {
    // Healthy — lengthen interval
    state.loopCount = Math.max(0, state.loopCount - 1);
    state.checkInterval = Math.min(MAX_CHECK_INTERVAL, state.checkInterval + 50);
  }

  // Track progress milestone
  if (state.tokenCount % 1000 < state.checkInterval) {
    state.progressMilestones.push(`${state.tokenCount} tokens generated`);
  }

  return {
    healthy: !loopDetected && !driftDetected,
    loopDetected,
    similarity,
    driftDetected,
    action,
    message,
  };
}

// ─── Detection Algorithms ───────────────────────────────────────────────────

/**
 * Detect repetition in output chunks using n-gram similarity
 */
function detectRepetition(chunks: string[]): number {
  if (chunks.length < 3) return 0;

  // Compare the last chunk against previous chunks
  const recent = chunks.slice(-2).join("");
  const previous = chunks.slice(-4, -2).join("");

  if (!recent || !previous) return 0;

  // Use trigram similarity (Jaccard coefficient)
  const recentTrigrams = extractNgrams(recent.toLowerCase(), 3);
  const previousTrigrams = extractNgrams(previous.toLowerCase(), 3);

  if (recentTrigrams.size === 0 || previousTrigrams.size === 0) return 0;

  const intersection = new Set(Array.from(recentTrigrams).filter(x => previousTrigrams.has(x)));
  const union = new Set([...Array.from(recentTrigrams), ...Array.from(previousTrigrams)]);

  return intersection.size / union.size;
}

/**
 * Detect if the generation has drifted from the original prompt
 */
function detectDrift(state: HeartbeatState): boolean {
  if (state.chunks.length < 5) return false;

  // Simple heuristic: check if recent output mentions anything from the prompt
  const promptKeywords = extractKeywords(state.originalPrompt);
  const recentContent = state.chunks.slice(-3).join(" ").toLowerCase();

  // If none of the prompt keywords appear in recent output, possible drift
  const matchCount = promptKeywords.filter(kw => recentContent.includes(kw)).length;
  const matchRatio = promptKeywords.length > 0 ? matchCount / promptKeywords.length : 1;

  // Drift if less than 10% of keywords match AND we're deep into generation
  return matchRatio < 0.1 && state.tokenCount > 1000;
}

// ─── Utility Functions ──────────────────────────────────────────────────────

/**
 * Extract n-grams from text
 */
function extractNgrams(text: string, n: number): Set<string> {
  const ngrams = new Set<string>();
  for (let i = 0; i <= text.length - n; i++) {
    ngrams.add(text.slice(i, i + n));
  }
  return ngrams;
}

/**
 * Extract meaningful keywords from text
 */
function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "can", "shall", "to", "of", "in", "for",
    "on", "with", "at", "by", "from", "as", "into", "through", "during",
    "before", "after", "above", "below", "between", "and", "but", "or",
    "not", "no", "so", "if", "then", "than", "that", "this", "these",
    "those", "it", "its", "my", "your", "his", "her", "our", "their",
    "i", "you", "he", "she", "we", "they", "me", "him", "us", "them",
    "what", "which", "who", "when", "where", "why", "how", "all", "each",
    "every", "both", "few", "more", "most", "other", "some", "such",
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(word => word.length > 3 && !stopWords.has(word))
    .slice(0, 15);
}

/**
 * Rough token estimation (4 chars ≈ 1 token)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Get the current progress percentage based on expected output length
 */
export function getProgressPercent(state: HeartbeatState, expectedTokens: number = 2000): number {
  return Math.min(100, Math.round((state.tokenCount / expectedTokens) * 100));
}

/**
 * Get a human-readable status for the heartbeat
 */
export function getHeartbeatStatus(state: HeartbeatState): string {
  if (!state.isHealthy) return "interrupted";
  if (state.loopCount > 0) return "warning";
  return "healthy";
}
