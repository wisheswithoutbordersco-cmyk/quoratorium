/**
 * Patent 2: Synthesis Verification (Captain/Wingman Architecture)
 * 
 * When Captain Q receives a prompt:
 * 1. Distribute to multiple AI models (wingmen)
 * 2. Collect independent responses
 * 3. Compare responses, detect contradictions, identify agreement
 * 4. Score consensus (0-100)
 * 5. Return confidence badge data
 * 
 * Runs in background — doesn't slow down the primary response.
 */
import OpenAI from "openai";
import { invokeLLM } from "./_core/llm";
import { logApiCall } from "./costService";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WingmanResponse {
  model: string;
  content: string;
  latencyMs: number;
  success: boolean;
}

export interface SynthesisResult {
  consensusScore: number; // 0-100
  verified: boolean; // true if score >= 75
  contradictions: string[];
  agreements: string[];
  wingmanCount: number;
  synthesisLatencyMs: number;
}

export interface VerificationBadge {
  score: number;
  label: string; // "Verified ✓ 92%" or "⚠️ Low confidence 45%"
  verified: boolean;
}

// ─── Wingman Dispatch ───────────────────────────────────────────────────────

/**
 * Dispatch the prompt to multiple AI models concurrently
 * Uses: DeepSeek (via OpenRouter), Gemini (via OpenRouter), Forge (fallback)
 */
async function dispatchToWingmen(
  messages: Array<{ role: string; content: string }>,
  primaryResponse: string
): Promise<WingmanResponse[]> {
  const wingmen: Promise<WingmanResponse>[] = [];

  // Wingman 1: Gemini 2.5 Flash via OpenRouter
  if (process.env.OPENROUTER_API_KEY) {
    wingmen.push(callWingman(messages, "google/gemini-2.5-flash", "OpenRouter"));
  }

  // Wingman 2: Forge (built-in LLM)
  wingmen.push(callForgeWingman(messages));

  // Wait for all wingmen (with timeout)
  const results = await Promise.allSettled(wingmen);
  const responses: WingmanResponse[] = [];

  for (const result of results) {
    if (result.status === "fulfilled" && result.value.success) {
      responses.push(result.value);
    }
  }

  return responses;
}

/**
 * Call a single wingman via OpenRouter
 */
async function callWingman(
  messages: Array<{ role: string; content: string }>,
  model: string,
  provider: string
): Promise<WingmanResponse> {
  const startTime = Date.now();
  try {
    const client = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://quoratorium.com",
        "X-Title": "Quoratorium Verification",
      },
    });

    const response = await client.chat.completions.create({
      model,
      messages: messages as any,
      max_tokens: 2048,
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content || "";
    logApiCall({
      userId: 0, model, worker: "wingman",
      inputTokens: response.usage?.prompt_tokens || 0,
      outputTokens: response.usage?.completion_tokens || 0,
      durationMs: Date.now() - startTime, success: true,
    }).catch(() => {});

    return { model, content, latencyMs: Date.now() - startTime, success: true };
  } catch (err) {
    return { model, content: "", latencyMs: Date.now() - startTime, success: false };
  }
}

/**
 * Call Forge as a wingman
 */
async function callForgeWingman(
  messages: Array<{ role: string; content: string }>
): Promise<WingmanResponse> {
  const startTime = Date.now();
  try {
    const result = await invokeLLM({ messages: messages as any });
    const content = result?.choices?.[0]?.message?.content || "";
    return {
      model: "forge-gemini-2.5-flash",
      content: typeof content === "string" ? content : JSON.stringify(content),
      latencyMs: Date.now() - startTime,
      success: true,
    };
  } catch {
    return { model: "forge-fallback", content: "", latencyMs: Date.now() - startTime, success: false };
  }
}

// ─── Synthesis Engine ───────────────────────────────────────────────────────

/**
 * Compare the primary response against wingman responses
 * Detect contradictions, measure agreement, score consensus
 */
async function synthesize(
  primaryResponse: string,
  wingmanResponses: WingmanResponse[],
  originalPrompt: string
): Promise<SynthesisResult> {
  const startTime = Date.now();

  if (wingmanResponses.length === 0) {
    return {
      consensusScore: 50, // Neutral when no verification possible
      verified: false,
      contradictions: [],
      agreements: [],
      wingmanCount: 0,
      synthesisLatencyMs: 0,
    };
  }

  try {
    const synthesisPrompt = `Compare these AI responses to the same prompt and assess consensus.

ORIGINAL PROMPT: "${originalPrompt.slice(0, 300)}"

PRIMARY RESPONSE (first 500 chars): "${primaryResponse.slice(0, 500)}"

${wingmanResponses.map((w, i) => `WINGMAN ${i + 1} (${w.model}, first 500 chars): "${w.content.slice(0, 500)}"`).join("\n\n")}

Assess:
1. Do the responses agree on key facts/recommendations?
2. Are there contradictions?
3. What's the overall consensus score (0-100)?`;

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "You are a synthesis verification engine. Compare AI responses and score consensus. Respond ONLY with valid JSON.",
        },
        { role: "user", content: synthesisPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "synthesis_result",
          strict: true,
          schema: {
            type: "object",
            properties: {
              consensus_score: { type: "integer", description: "0-100 consensus score" },
              contradictions: {
                type: "array",
                items: { type: "string" },
                description: "List of contradictions found",
              },
              agreements: {
                type: "array",
                items: { type: "string" },
                description: "List of key agreements",
              },
            },
            required: ["consensus_score", "contradictions", "agreements"],
            additionalProperties: false,
          },
        },
      },
    });

    const contentValue = response?.choices?.[0]?.message?.content;
    const contentStr = typeof contentValue === 'string' ? contentValue : JSON.stringify(contentValue || {});
    const parsed = JSON.parse(contentStr || "{}");
    const score = Math.min(100, Math.max(0, parsed.consensus_score || 50));

    return {
      consensusScore: score,
      verified: score >= 75,
      contradictions: parsed.contradictions || [],
      agreements: parsed.agreements || [],
      wingmanCount: wingmanResponses.length,
      synthesisLatencyMs: Date.now() - startTime,
    };
  } catch (err) {
    console.warn("[Synthesis] Verification failed:", err);
    return {
      consensusScore: 50,
      verified: false,
      contradictions: [],
      agreements: [],
      wingmanCount: wingmanResponses.length,
      synthesisLatencyMs: Date.now() - startTime,
    };
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Run background verification on a response
 * This is called AFTER the primary response has been streamed to the user
 * Returns the verification result for badge display
 */
export async function verifyResponse(
  messages: Array<{ role: string; content: string }>,
  primaryResponse: string,
  originalPrompt: string
): Promise<SynthesisResult> {
  // Dispatch to wingmen concurrently
  const wingmanResponses = await dispatchToWingmen(messages, primaryResponse);

  // Run synthesis
  const result = await synthesize(primaryResponse, wingmanResponses, originalPrompt);

  return result;
}

/**
 * Generate a verification badge from synthesis result
 */
export function generateBadge(result: SynthesisResult): VerificationBadge {
  if (result.wingmanCount === 0) {
    return { score: 0, label: "", verified: false };
  }

  if (result.verified) {
    return {
      score: result.consensusScore,
      label: `✓ ${result.consensusScore}%`,
      verified: true,
    };
  } else {
    return {
      score: result.consensusScore,
      label: `⚠️ ${result.consensusScore}%`,
      verified: false,
    };
  }
}

/**
 * Quick verification for simple/short responses (skip full synthesis)
 * Returns true if the response should be verified (complex enough)
 */
export function shouldVerify(message: string, response: string): boolean {
  // Skip verification for very short responses (greetings, confirmations)
  if (response.length < 100) return false;
  // Skip for code-only responses (code is self-verifying via execution)
  if (response.match(/^```[\s\S]*```$/)) return false;
  // Skip for image/browser/execution results
  if (message.length < 20) return false;
  // Verify substantive responses
  return true;
}
