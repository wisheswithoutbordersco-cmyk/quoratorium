/**
 * Session Stabilization Engine — Stabilization Process
 * 
 * The core stabilization pipeline:
 * 1. SNAPSHOT: Capture current session state (messages, context, project state)
 * 2. COMPRESS: Summarize conversation into essential context (LLM-powered)
 * 3. DISCARD: Remove noise, dead-ends, redundant explanations, stale retries
 * 4. REBUILD: Reconstruct clean context with compressed summaries + active state
 * 
 * The user should feel: "same session, refreshed cognition."
 * NOT: "new chat."
 */

import { invokeLLM } from "./_core/llm";
import { resetSessionAfterStabilization, getSessionHealth } from "./sessionHealth";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StabilizationSnapshot {
  sessionId: string;
  userId: string;
  messages: ConversationMessage[];
  projectContext: ProjectContext | null;
  protectedMemories: string[];
  timestamp: number;
}

export interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
}

export interface ProjectContext {
  projectId: number;
  projectName: string;
  activeFiles: string[];
  recentDecisions: string[];
}

export interface StabilizationResult {
  success: boolean;
  compressedContext: string;
  preservedMessages: ConversationMessage[];
  discardedCount: number;
  originalTokenEstimate: number;
  compressedTokenEstimate: number;
  compressionRatio: number;
  summary: string;
  duration: number;
}

export type StabilizationPhase = 
  | "idle"
  | "snapshot" 
  | "compressing" 
  | "discarding" 
  | "rebuilding" 
  | "complete" 
  | "failed";

export interface StabilizationProgress {
  phase: StabilizationPhase;
  progress: number; // 0-100
  message: string;
}

// ─── Stabilization Pipeline ─────────────────────────────────────────────────

/**
 * Run the full stabilization pipeline
 */
export async function stabilizeSession(
  snapshot: StabilizationSnapshot,
  onProgress?: (progress: StabilizationProgress) => void
): Promise<StabilizationResult> {
  const startTime = Date.now();
  const report = (phase: StabilizationPhase, progress: number, message: string) => {
    onProgress?.({ phase, progress, message });
  };

  try {
    // ─── Phase 1: SNAPSHOT ─────────────────────────────────────────────
    report("snapshot", 10, "Capturing session state...");
    const originalTokens = estimateTokens(snapshot.messages);

    // ─── Phase 2: COMPRESS ─────────────────────────────────────────────
    report("compressing", 30, "Compressing conversation into essential context...");
    const compressed = await compressConversation(snapshot.messages, snapshot.protectedMemories);

    // ─── Phase 3: DISCARD ──────────────────────────────────────────────
    report("discarding", 60, "Removing noise, dead-ends, and redundant content...");
    const { preserved, discardedCount } = discardNoise(snapshot.messages, compressed.keyMessages);

    // ─── Phase 4: REBUILD ──────────────────────────────────────────────
    report("rebuilding", 85, "Reconstructing clean context...");
    const rebuilt = await rebuildContext(
      compressed.summary,
      preserved,
      snapshot.projectContext,
      snapshot.protectedMemories
    );

    // Reset health metrics
    const compressedTokens = estimateTokens(preserved) + estimateTokenCount(rebuilt);
    resetSessionAfterStabilization(snapshot.sessionId, compressedTokens);

    report("complete", 100, "Session stabilized successfully.");

    return {
      success: true,
      compressedContext: rebuilt,
      preservedMessages: preserved,
      discardedCount,
      originalTokenEstimate: originalTokens,
      compressedTokenEstimate: compressedTokens,
      compressionRatio: originalTokens > 0 ? compressedTokens / originalTokens : 1,
      summary: compressed.summary,
      duration: Date.now() - startTime,
    };
  } catch (error: any) {
    report("failed", 0, `Stabilization failed: ${error?.message || "Unknown error"}`);
    return {
      success: false,
      compressedContext: "",
      preservedMessages: snapshot.messages.slice(-5), // Keep last 5 as fallback
      discardedCount: 0,
      originalTokenEstimate: estimateTokens(snapshot.messages),
      compressedTokenEstimate: estimateTokens(snapshot.messages),
      compressionRatio: 1,
      summary: "Stabilization failed — session continues with existing context.",
      duration: Date.now() - startTime,
    };
  }
}

// ─── Phase 2: Compression ───────────────────────────────────────────────────

interface CompressionResult {
  summary: string;
  keyMessages: number[]; // Indices of messages to preserve
  decisions: string[];
  activeGoals: string[];
}

async function compressConversation(
  messages: ConversationMessage[],
  protectedMemories: string[]
): Promise<CompressionResult> {
  // Build a condensed transcript for the LLM
  const transcript = messages
    .map((m, i) => `[${i}] ${m.role}: ${m.content.slice(0, 300)}${m.content.length > 300 ? "..." : ""}`)
    .join("\n");

  const memoryBlock = protectedMemories.length > 0
    ? `\n\nProtected memories (MUST preserve):\n${protectedMemories.join("\n")}`
    : "";

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a session compression engine. Analyze the conversation transcript and produce a JSON response with:
1. "summary": A 2-4 paragraph summary of the entire session — what was discussed, what was decided, what was built, what's currently in progress. Write as if briefing someone who needs to continue this exact work.
2. "keyMessages": Array of message indices [numbers] that contain critical information that MUST be preserved verbatim (decisions, requirements, code specifications, user preferences, corrections).
3. "decisions": Array of key decisions made during the session.
4. "activeGoals": Array of goals/tasks that are still in progress or unfinished.

Rules:
- ALWAYS preserve messages containing: user requirements, architectural decisions, error reports, corrections, preferences
- DISCARD: greetings, acknowledgments, "let me think about that", repeated explanations, failed attempts that were superseded
- The summary should be dense with information — no filler
- Keep the user's voice and intent intact in the summary`
        },
        {
          role: "user",
          content: `Compress this session (${messages.length} messages):${memoryBlock}\n\nTranscript:\n${transcript}`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "compression_result",
          strict: true,
          schema: {
            type: "object",
            properties: {
              summary: { type: "string", description: "Dense session summary" },
              keyMessages: { type: "array", items: { type: "integer" }, description: "Indices of critical messages" },
              decisions: { type: "array", items: { type: "string" }, description: "Key decisions made" },
              activeGoals: { type: "array", items: { type: "string" }, description: "Unfinished goals" },
            },
            required: ["summary", "keyMessages", "decisions", "activeGoals"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response?.choices?.[0]?.message?.content;
    const content = typeof rawContent === "string" ? rawContent : Array.isArray(rawContent) ? rawContent.map((c: any) => c.text || "").join("") : null;
    if (content) {
      const parsed = JSON.parse(content) as CompressionResult;
      return parsed;
    }
  } catch (err) {
    console.warn("[Stabilizer] Compression LLM call failed:", err);
  }

  // Fallback: keep last 10 messages, generate basic summary
  return {
    summary: `Session with ${messages.length} messages. Last topic: ${messages[messages.length - 1]?.content.slice(0, 100) || "unknown"}`,
    keyMessages: messages.slice(-10).map((_, i) => messages.length - 10 + i).filter(i => i >= 0),
    decisions: [],
    activeGoals: [],
  };
}

// ─── Phase 3: Discard ───────────────────────────────────────────────────────

interface DiscardResult {
  preserved: ConversationMessage[];
  discardedCount: number;
}

function discardNoise(
  messages: ConversationMessage[],
  keyIndices: number[]
): DiscardResult {
  const keySet = new Set(keyIndices);
  const preserved: ConversationMessage[] = [];
  let discardedCount = 0;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    // Always keep key messages
    if (keySet.has(i)) {
      preserved.push(msg);
      continue;
    }

    // Always keep the last 3 messages (active context)
    if (i >= messages.length - 3) {
      preserved.push(msg);
      continue;
    }

    // Discard criteria
    if (shouldDiscard(msg)) {
      discardedCount++;
      continue;
    }

    // Keep messages with substantial content
    if (msg.content.length > 100) {
      preserved.push(msg);
    } else {
      discardedCount++;
    }
  }

  return { preserved, discardedCount };
}

function shouldDiscard(msg: ConversationMessage): boolean {
  const lower = msg.content.toLowerCase().trim();

  // Discard short acknowledgments
  if (lower.length < 30 && /^(ok|sure|got it|thanks|understood|alright|sounds good|perfect|great)/.test(lower)) {
    return true;
  }

  // Discard "let me think" / "processing" messages
  if (/^(let me|i'll|processing|analyzing|working on|one moment)/.test(lower) && lower.length < 80) {
    return true;
  }

  // Discard repeated error messages
  if (/^(error|failed|an error occurred|something went wrong)/.test(lower) && lower.length < 100) {
    return true;
  }

  // Discard filler
  if (/^(here's what|as you can see|to summarize what we've discussed so far)/.test(lower) && lower.length < 60) {
    return true;
  }

  return false;
}

// ─── Phase 4: Rebuild ───────────────────────────────────────────────────────

async function rebuildContext(
  summary: string,
  preservedMessages: ConversationMessage[],
  projectContext: ProjectContext | null,
  protectedMemories: string[]
): Promise<string> {
  const parts: string[] = [];

  // Session continuity header
  parts.push("═══ SESSION CONTEXT (Stabilized) ═══");
  parts.push("");

  // Summary
  parts.push("## Session Summary");
  parts.push(summary);
  parts.push("");

  // Protected memories
  if (protectedMemories.length > 0) {
    parts.push("## Protected Memories");
    for (const mem of protectedMemories) {
      parts.push(`• ${mem}`);
    }
    parts.push("");
  }

  // Project context
  if (projectContext) {
    parts.push("## Active Project");
    parts.push(`Project: ${projectContext.projectName} (#${projectContext.projectId})`);
    if (projectContext.activeFiles.length > 0) {
      parts.push(`Active files: ${projectContext.activeFiles.join(", ")}`);
    }
    if (projectContext.recentDecisions.length > 0) {
      parts.push("Recent decisions:");
      for (const d of projectContext.recentDecisions) {
        parts.push(`  • ${d}`);
      }
    }
    parts.push("");
  }

  parts.push("═══ END SESSION CONTEXT ═══");

  return parts.join("\n");
}

// ─── Utility ────────────────────────────────────────────────────────────────

function estimateTokens(messages: ConversationMessage[]): number {
  // Rough estimate: 1 token ≈ 4 characters
  return Math.ceil(messages.reduce((sum, m) => sum + m.content.length, 0) / 4);
}

function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
