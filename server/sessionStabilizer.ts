import { invokeLLM } from "./_core/llm";

export interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
}

export interface StabilizationSnapshot {
  sessionId: string;
  messages: ConversationMessage[];
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
  error?: string;
}

interface CompressionResult {
  summary: string;
  keyMessages: number[];
}

/**
 * Compresses one persisted conversation. Persistence is intentionally handled
 * by the caller so a result is not reported as successful until its context is
 * durably stored alongside that conversation.
 */
export async function stabilizeSession(
  snapshot: StabilizationSnapshot
): Promise<StabilizationResult> {
  const startedAt = Date.now();
  const messages = snapshot.messages.filter(
    message => message.content.trim().length > 0
  );
  const originalTokenEstimate = estimateTokens(messages);

  if (messages.length === 0) {
    return failedResult({
      messages,
      originalTokenEstimate,
      startedAt,
      error: "There are no persisted messages to compress.",
    });
  }

  try {
    const compressed = await compressConversation(messages);
    const { preservedMessages, discardedCount } = retainEssentialMessages(
      messages,
      compressed.keyMessages
    );
    const compressedContext = buildCompressedContext(
      compressed.summary,
      preservedMessages
    );

    if (!compressedContext.trim()) {
      return failedResult({
        messages,
        originalTokenEstimate,
        startedAt,
        error: "No durable context was produced.",
      });
    }

    const compressedTokenEstimate = estimateTokenCount(compressedContext);

    return {
      success: true,
      compressedContext,
      preservedMessages,
      discardedCount,
      originalTokenEstimate,
      compressedTokenEstimate,
      compressionRatio:
        originalTokenEstimate > 0
          ? compressedTokenEstimate / originalTokenEstimate
          : 1,
      summary: compressed.summary,
      duration: Date.now() - startedAt,
    };
  } catch (error: unknown) {
    return failedResult({
      messages,
      originalTokenEstimate,
      startedAt,
      error:
        error instanceof Error
          ? error.message
          : "Unable to compress this conversation.",
    });
  }
}

async function compressConversation(
  messages: ConversationMessage[]
): Promise<CompressionResult> {
  const transcript = messages
    .map(
      (message, index) =>
        `[${index}] ${message.role}: ${message.content.slice(0, 1_500)}`
    )
    .join("\n\n");

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: [
            "Summarize this persisted conversation for its next response.",
            "Return JSON with a concise factual summary and indexes of messages whose requirements, decisions, corrections, errors, or unfinished work must be retained.",
            "Do not invent progress, outcomes, or decisions.",
          ].join(" "),
        },
        {
          role: "user",
          content: transcript,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "conversation_compression",
          strict: true,
          schema: {
            type: "object",
            properties: {
              summary: { type: "string" },
              keyMessages: { type: "array", items: { type: "integer" } },
            },
            required: ["summary", "keyMessages"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response?.choices?.[0]?.message?.content;
    const content =
      typeof rawContent === "string"
        ? rawContent
        : Array.isArray(rawContent)
          ? rawContent.map((part: any) => part.text || "").join("")
          : "";
    if (content) {
      const parsed = JSON.parse(content) as CompressionResult;
      if (
        typeof parsed.summary === "string" &&
        Array.isArray(parsed.keyMessages)
      ) {
        return {
          summary: parsed.summary.trim(),
          keyMessages: parsed.keyMessages.filter(
            index =>
              Number.isInteger(index) && index >= 0 && index < messages.length
          ),
        };
      }
    }
  } catch (error) {
    console.warn(
      "[SessionStabilizer] LLM compression unavailable; using a bounded transcript fallback.",
      error
    );
  }

  // This fallback is deterministic and preserves real recent messages rather
  // than inventing a summary when an LLM response is unavailable.
  return {
    summary:
      "A compressed summary could not be generated; the retained excerpts below are the available conversation context.",
    keyMessages: messages
      .slice(-8)
      .map((_, index) => Math.max(0, messages.length - 8) + index),
  };
}

function retainEssentialMessages(
  messages: ConversationMessage[],
  keyIndices: number[]
): { preservedMessages: ConversationMessage[]; discardedCount: number } {
  const keep = new Set(keyIndices);
  for (
    let index = Math.max(0, messages.length - 3);
    index < messages.length;
    index += 1
  ) {
    keep.add(index);
  }

  const preservedMessages = messages.filter((_, index) => keep.has(index));
  return {
    preservedMessages,
    discardedCount: Math.max(0, messages.length - preservedMessages.length),
  };
}

function buildCompressedContext(
  summary: string,
  preservedMessages: ConversationMessage[]
): string {
  const parts = [
    "Conversation summary:",
    summary.trim() || "No summary was available.",
  ];
  if (preservedMessages.length > 0) {
    parts.push("", "Retained excerpts:");
    for (const message of preservedMessages) {
      parts.push(`${message.role}: ${message.content.slice(0, 2_000)}`);
    }
  }
  return parts.join("\n").trim();
}

function failedResult(input: {
  messages: ConversationMessage[];
  originalTokenEstimate: number;
  startedAt: number;
  error: string;
}): StabilizationResult {
  return {
    success: false,
    compressedContext: "",
    preservedMessages: [],
    discardedCount: 0,
    originalTokenEstimate: input.originalTokenEstimate,
    compressedTokenEstimate: input.originalTokenEstimate,
    compressionRatio: 1,
    summary: input.error,
    duration: Date.now() - input.startedAt,
    error: input.error,
  };
}

function estimateTokens(messages: ConversationMessage[]): number {
  return Math.ceil(
    messages.reduce((sum, message) => sum + message.content.length, 0) / 4
  );
}

function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
