/**
 * Session Stabilization Engine — Health Monitoring
 * 
 * Continuously monitors session health metrics:
 * - Token/context pressure
 * - Repetitive outputs
 * - Repeated tool calls
 * - Retry storms
 * - Contradiction frequency
 * - Failed executions
 * - Loop indicators
 * - Excessive context growth
 * 
 * Computes a session health state:
 * - Stable: everything flowing well
 * - Elevated Load: context growing, minor repetition
 * - High Context Pressure: nearing limits, some issues detected
 * - Stabilization Recommended: critical — loops, drift, or context overflow
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type SessionHealthState = 
  | "stable" 
  | "elevated" 
  | "high_pressure" 
  | "stabilization_recommended";

export interface SessionMetrics {
  totalTokens: number;
  messageCount: number;
  contextWindowUsed: number; // percentage 0-100
  repetitionScore: number; // 0-1 (1 = highly repetitive)
  failedExecutions: number;
  toolCallCount: number;
  retryCount: number;
  contradictionIndicators: number;
  loopIndicators: number;
  lastUpdated: number;
  sessionStartedAt: number;
  avgResponseTime: number; // ms
}

export interface SessionHealthReport {
  state: SessionHealthState;
  metrics: SessionMetrics;
  score: number; // 0-100 (100 = perfectly healthy)
  recommendations: string[];
  canStabilize: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_CONTEXT_TOKENS = 128000; // Model context window
const ELEVATED_THRESHOLD = 60; // % context used
const HIGH_PRESSURE_THRESHOLD = 80; // % context used
const CRITICAL_THRESHOLD = 92; // % context used

const REPETITION_ELEVATED = 0.3;
const REPETITION_HIGH = 0.6;
const REPETITION_CRITICAL = 0.8;

const MAX_RETRIES_BEFORE_WARNING = 3;
const MAX_FAILURES_BEFORE_WARNING = 5;
const MAX_LOOP_INDICATORS_BEFORE_CRITICAL = 3;

// ─── In-Memory Session Store ────────────────────────────────────────────────

interface SessionState {
  metrics: SessionMetrics;
  recentOutputs: string[]; // Rolling window for repetition detection
  recentToolCalls: string[]; // Track tool call patterns
  responseTimestamps: number[]; // For avg response time calculation
}

const sessions = new Map<string, SessionState>();

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Initialize or get a session's health state
 */
export function getOrCreateSession(sessionId: string): SessionState {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      metrics: {
        totalTokens: 0,
        messageCount: 0,
        contextWindowUsed: 0,
        repetitionScore: 0,
        failedExecutions: 0,
        toolCallCount: 0,
        retryCount: 0,
        contradictionIndicators: 0,
        loopIndicators: 0,
        lastUpdated: Date.now(),
        sessionStartedAt: Date.now(),
        avgResponseTime: 0,
      },
      recentOutputs: [],
      recentToolCalls: [],
      responseTimestamps: [],
    });
  }
  return sessions.get(sessionId)!;
}

/**
 * Record a message exchange (user + assistant)
 */
export function recordMessage(
  sessionId: string,
  tokenCount: number,
  responseContent: string,
  responseTimeMs: number
): void {
  const session = getOrCreateSession(sessionId);
  const m = session.metrics;

  m.messageCount += 1;
  m.totalTokens += tokenCount;
  m.contextWindowUsed = Math.min(100, (m.totalTokens / MAX_CONTEXT_TOKENS) * 100);
  m.lastUpdated = Date.now();

  // Track response time
  session.responseTimestamps.push(responseTimeMs);
  if (session.responseTimestamps.length > 20) session.responseTimestamps.shift();
  m.avgResponseTime = session.responseTimestamps.reduce((a, b) => a + b, 0) / session.responseTimestamps.length;

  // Track output for repetition detection
  const trimmed = responseContent.slice(0, 500).toLowerCase().trim();
  session.recentOutputs.push(trimmed);
  if (session.recentOutputs.length > 10) session.recentOutputs.shift();

  // Calculate repetition score
  m.repetitionScore = calculateRepetition(session.recentOutputs);

  // Detect loop indicators from content patterns
  if (detectLoopPatterns(responseContent)) {
    m.loopIndicators += 1;
  }
}

/**
 * Record a tool call
 */
export function recordToolCall(sessionId: string, toolName: string): void {
  const session = getOrCreateSession(sessionId);
  session.metrics.toolCallCount += 1;
  session.recentToolCalls.push(toolName);
  if (session.recentToolCalls.length > 20) session.recentToolCalls.shift();

  // Detect repeated tool calls (retry storm)
  const last5 = session.recentToolCalls.slice(-5);
  if (last5.length >= 5 && new Set(last5).size === 1) {
    session.metrics.retryCount += 1;
  }
}

/**
 * Record a failed execution
 */
export function recordFailure(sessionId: string): void {
  const session = getOrCreateSession(sessionId);
  session.metrics.failedExecutions += 1;
}

/**
 * Record a contradiction (when AI contradicts a previous statement)
 */
export function recordContradiction(sessionId: string): void {
  const session = getOrCreateSession(sessionId);
  session.metrics.contradictionIndicators += 1;
}

/**
 * Get the current health report for a session
 */
export function getSessionHealth(sessionId: string): SessionHealthReport {
  const session = getOrCreateSession(sessionId);
  const m = session.metrics;

  // Calculate overall health score (100 = perfect, 0 = critical)
  let score = 100;

  // Context pressure penalty (up to -40 points)
  if (m.contextWindowUsed > CRITICAL_THRESHOLD) score -= 40;
  else if (m.contextWindowUsed > HIGH_PRESSURE_THRESHOLD) score -= 25;
  else if (m.contextWindowUsed > ELEVATED_THRESHOLD) score -= 10;

  // Repetition penalty (up to -25 points)
  if (m.repetitionScore > REPETITION_CRITICAL) score -= 25;
  else if (m.repetitionScore > REPETITION_HIGH) score -= 15;
  else if (m.repetitionScore > REPETITION_ELEVATED) score -= 8;

  // Failure penalty (up to -15 points)
  score -= Math.min(15, m.failedExecutions * 3);

  // Retry storm penalty (up to -10 points)
  score -= Math.min(10, m.retryCount * 3);

  // Loop indicator penalty (up to -15 points)
  score -= Math.min(15, m.loopIndicators * 5);

  // Contradiction penalty (up to -10 points)
  score -= Math.min(10, m.contradictionIndicators * 3);

  score = Math.max(0, Math.min(100, score));

  // Determine state
  let state: SessionHealthState;
  if (score >= 75) state = "stable";
  else if (score >= 50) state = "elevated";
  else if (score >= 25) state = "high_pressure";
  else state = "stabilization_recommended";

  // Override: force critical if specific thresholds are hit
  if (m.loopIndicators >= MAX_LOOP_INDICATORS_BEFORE_CRITICAL) state = "stabilization_recommended";
  if (m.contextWindowUsed >= CRITICAL_THRESHOLD) state = "stabilization_recommended";
  if (m.repetitionScore >= REPETITION_CRITICAL && m.messageCount > 5) state = "stabilization_recommended";

  // Generate recommendations
  const recommendations: string[] = [];
  if (m.contextWindowUsed > HIGH_PRESSURE_THRESHOLD) {
    recommendations.push("Context window is nearly full. Stabilization will compress conversation history.");
  }
  if (m.repetitionScore > REPETITION_HIGH) {
    recommendations.push("High repetition detected. The AI may be looping on similar outputs.");
  }
  if (m.failedExecutions > MAX_FAILURES_BEFORE_WARNING) {
    recommendations.push("Multiple execution failures. Stabilization will clear stale retry state.");
  }
  if (m.retryCount > MAX_RETRIES_BEFORE_WARNING) {
    recommendations.push("Retry storm detected. The same tool is being called repeatedly.");
  }
  if (m.loopIndicators > 1) {
    recommendations.push("Loop patterns detected in responses. Context may be polluted.");
  }

  const canStabilize = state !== "stable" || m.messageCount > 20;

  return { state, metrics: { ...m }, score, recommendations, canStabilize };
}

/**
 * Reset session metrics after stabilization
 */
export function resetSessionAfterStabilization(sessionId: string, preservedTokenCount: number): void {
  const session = getOrCreateSession(sessionId);
  session.metrics = {
    totalTokens: preservedTokenCount,
    messageCount: 0,
    contextWindowUsed: Math.min(100, (preservedTokenCount / MAX_CONTEXT_TOKENS) * 100),
    repetitionScore: 0,
    failedExecutions: 0,
    toolCallCount: 0,
    retryCount: 0,
    contradictionIndicators: 0,
    loopIndicators: 0,
    lastUpdated: Date.now(),
    sessionStartedAt: session.metrics.sessionStartedAt, // Preserve original start
    avgResponseTime: session.metrics.avgResponseTime, // Preserve baseline
  };
  session.recentOutputs = [];
  session.recentToolCalls = [];
  session.responseTimestamps = [];
}

/**
 * Destroy a session (cleanup)
 */
export function destroySession(sessionId: string): void {
  sessions.delete(sessionId);
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

/**
 * Calculate repetition score from recent outputs using trigram similarity
 */
function calculateRepetition(outputs: string[]): number {
  if (outputs.length < 3) return 0;

  const trigrams = (text: string): Set<string> => {
    const t = new Set<string>();
    for (let i = 0; i < text.length - 2; i++) {
      t.add(text.slice(i, i + 3));
    }
    return t;
  };

  const jaccardSimilarity = (a: Set<string>, b: Set<string>): number => {
    if (a.size === 0 && b.size === 0) return 0;
    let intersection = 0;
    Array.from(a).forEach((item) => {
      if (b.has(item)) intersection++;
    });
    return intersection / (a.size + b.size - intersection);
  };

  // Compare each pair of consecutive outputs
  let totalSimilarity = 0;
  let pairs = 0;
  for (let i = 1; i < outputs.length; i++) {
    const a = trigrams(outputs[i - 1]);
    const b = trigrams(outputs[i]);
    totalSimilarity += jaccardSimilarity(a, b);
    pairs++;
  }

  return pairs > 0 ? totalSimilarity / pairs : 0;
}

/**
 * Detect loop patterns in response content
 */
function detectLoopPatterns(content: string): boolean {
  const lower = content.toLowerCase();

  // Pattern 1: Repeated phrases within the same response
  const sentences = lower.split(/[.!?\n]+/).filter(s => s.trim().length > 20);
  if (sentences.length >= 4) {
    const unique = new Set(sentences.map(s => s.trim()));
    if (unique.size < sentences.length * 0.5) return true; // More than 50% duplicates
  }

  // Pattern 2: Self-referential loops ("as I mentioned", "as stated above" repeated)
  const selfRefPatterns = ["as i mentioned", "as stated above", "as previously", "like i said"];
  const selfRefCount = selfRefPatterns.reduce((count, p) => count + (lower.split(p).length - 1), 0);
  if (selfRefCount >= 3) return true;

  // Pattern 3: Structural repetition (same markdown headers repeated)
  const headers = content.match(/^#{1,3}\s+.+$/gm) || [];
  if (headers.length >= 4) {
    const uniqueHeaders = new Set(headers.map(h => h.toLowerCase().trim()));
    if (uniqueHeaders.size < headers.length * 0.6) return true;
  }

  return false;
}
