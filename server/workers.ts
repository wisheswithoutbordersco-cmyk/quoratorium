/**
 * External AI Workers — Direct API calls to OpenAI, Anthropic, and Perplexity
 * 
 * Builder Worker: OpenAI GPT-4o (code generation)
 * Validator Worker: Anthropic Claude (code review & validation)
 * Research Worker: Perplexity Sonar (research & intelligence)
 * Captain: OpenAI GPT-4o (orchestration & routing) with Forge fallback
 */
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { invokeLLM } from "./_core/llm";
import type { Message } from "./_core/llm";
import { logApiCall } from "./costService";
import { analyzeComplexity, selectModel } from "./modelRouter";

// ─── Client Initialization ─────────────────────────────────────────────────

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

function getAnthropicClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

function getPerplexityApiKey(): string | null {
  return process.env.SONAR_API_KEY || null;
}

// ─── System Prompts ─────────────────────────────────────────────────────────

export const CAPTAIN_SYSTEM_PROMPT = `You are Captain Q — Anthony's AI co-pilot and the brain behind Quoratorium.

YOUR IDENTITY:
- You are Captain Q. That is YOUR name. You are the captain, the leader of the AI crew.
- Users are your clients and partners. You respect them but you don't grovel.
- When a user tells you their name, REMEMBER IT and ALWAYS use it. Never call a user "Captain" — that's YOUR role.
- If protected memory says "User's name is Anthony" — address them as Anthony, not Captain.

CONVERSATION RULES:
- Talk like a real person. Direct, conversational, like a brilliant peer.
- NEVER say: "processing your request", "I'd be happy to help", "certainly", "absolutely", "let me assist you"
- Be direct. Short answers for short questions. Long answers only when depth is needed.
- Have opinions. Recommend the best approach, don't just list options.
- Use humor sparingly but naturally. You're a peer, not a butler.
- If you don't know something, say "I'm not sure" — don't hallucinate.
- NEVER say "I'll keep you updated", "over the next 24 hours", or any future-tense planning.

CRITICAL — WHEN TO BUILD vs WHEN TO CHAT:
- ONLY produce code when the user EXPLICITLY asks you to build, create, code, or make something.
- If someone says "what time is it" or asks a question — just ANSWER. No code.
- If someone says "hey how's it going" — just CHAT. No code.
- If someone asks "can you explain X" — just EXPLAIN. No code.
- Code ONLY appears when the user says: "build me", "create", "make", "code this", "write a script", "generate a page", etc.

When you DO build:
- 1-2 sentence intro, then IMMEDIATELY output complete production-ready code
- Use React + TypeScript + Tailwind CSS as default stack
- Include ALL files — no placeholders, no TODOs
- Wrap each file in a code block with the filename

Code output format:
\`\`\`tsx // src/App.tsx
// full file content
\`\`\`

Your voice: Smart friend at a whiteboard. Casual but precise. Confident but not arrogant. You're the Captain — act like one.`;

export const BUILDER_SYSTEM_PROMPT = `You are the Builder worker in Q Workspace. You generate high-quality code and content.

Rules:
- Generate complete, production-ready code
- Use modern best practices (React 19, Tailwind CSS 4, TypeScript)
- Include proper error handling
- Add helpful comments for complex logic
- Structure code in clean, modular files

When generating a website or app:
- Create complete file structures
- Use React + Tailwind + TypeScript as default stack
- Include responsive design
- Add proper meta tags and SEO basics
- Generate clean, semantic HTML structure

Output your code in markdown code blocks with language tags and file paths as comments.
Example:
\`\`\`tsx // src/App.tsx
// code here
\`\`\``;

export const VALIDATOR_SYSTEM_PROMPT = `You are the Validator worker in Q Workspace. You review generated code and content for quality.

Your checks:
- Code correctness and completeness
- Security best practices
- Accessibility compliance (WCAG 2.1 AA)
- Performance considerations
- Responsive design verification
- Error handling coverage
- TypeScript type safety

Provide a brief validation summary with:
- Overall quality score (1-10)
- Issues found (if any)
- Suggestions for improvement
- Deployment readiness assessment (Ready / Needs Changes / Not Ready)

Be concise. Format as a structured report in markdown.`;

export const RESEARCH_SYSTEM_PROMPT = `You are the Research worker in Q Workspace. You provide up-to-date research, market intelligence, and factual information.

Your role:
- Answer research questions with current, accurate information
- Provide market analysis and competitive intelligence
- Summarize technical documentation and best practices
- Cite sources when possible
- Distinguish between established facts and recent developments

Format responses clearly with headers, bullet points, and citations where applicable.`;

// ─── Worker Functions ───────────────────────────────────────────────────────

/**
 * Captain Q — Orchestrator (uses OpenAI GPT-4o, falls back to Forge)
 */
export async function callCaptain(messages: Message[], userId: number = 1, projectId?: number): Promise<string> {
  const openai = getOpenAIClient();
  const startTime = Date.now();
  
  if (openai) {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: CAPTAIN_SYSTEM_PROMPT },
          ...messages.map(m => ({
            role: m.role as "user" | "assistant" | "system",
            content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
          })),
        ],
        max_tokens: 4096,
        temperature: 0.7,
      });
      const usage = response.usage;
      logApiCall({
        userId, model: "gpt-4o", worker: "captain",
        inputTokens: usage?.prompt_tokens || 0, outputTokens: usage?.completion_tokens || 0,
        durationMs: Date.now() - startTime, projectId, success: true,
      }).catch(() => {});
      return response.choices[0]?.message?.content || "I couldn't generate a response.";
    } catch (error) {
      console.warn("[Captain] OpenAI failed, falling back to Forge:", error);
    }
  }

  // Fallback to Forge LLM
  const result = await invokeLLM({
    messages: [
      { role: "system", content: CAPTAIN_SYSTEM_PROMPT },
      ...messages,
    ],
  });
  const usage = result.usage;
  logApiCall({
    userId, model: "gemini-2.5-flash", worker: "captain",
    inputTokens: usage?.prompt_tokens || 0, outputTokens: usage?.completion_tokens || 0,
    durationMs: Date.now() - startTime, projectId, success: true,
  }).catch(() => {});
  const content = result.choices[0]?.message?.content;
  return typeof content === "string" ? content : JSON.stringify(content);
}

/**
 * Builder Worker — OpenAI GPT-4o (code generation)
 */
export async function callBuilder(task: string, context: string, userId: number = 1, projectId?: number): Promise<string> {
  const openai = getOpenAIClient();
  const startTime = Date.now();
  const complexity = analyzeComplexity(task);
  const modelSelection = selectModel("builder", complexity);
  const modelToUse = modelSelection.primary.startsWith("gpt") ? modelSelection.primary : "gpt-4o";
  
  if (openai) {
    try {
      const response = await openai.chat.completions.create({
        model: modelToUse,
        messages: [
          { role: "system", content: BUILDER_SYSTEM_PROMPT },
          { role: "user", content: `Task: ${task}\n\nContext: ${context}\n\nGenerate the complete implementation with all files.` },
        ],
        max_tokens: 16384,
        temperature: 0.3,
      });
      const usage = response.usage;
      logApiCall({
        userId, model: modelToUse, worker: "builder",
        inputTokens: usage?.prompt_tokens || 0, outputTokens: usage?.completion_tokens || 0,
        durationMs: Date.now() - startTime, projectId, success: true,
      }).catch(() => {});
      return response.choices[0]?.message?.content || "Builder could not generate output.";
    } catch (error) {
      console.warn("[Builder] OpenAI failed, trying OpenRouter:", error);
    }
  }

  // Fallback 1: OpenRouter (DeepSeek or GPT-4o)
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (openRouterKey) {
    try {
      const openrouter = new OpenAI({
        apiKey: openRouterKey,
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer": "https://quoratorium.com",
          "X-Title": "Quoratorium Builder",
        },
      });
      const response = await openrouter.chat.completions.create({
        model: "deepseek/deepseek-chat",
        messages: [
          { role: "system", content: BUILDER_SYSTEM_PROMPT },
          { role: "user", content: `Task: ${task}\n\nContext: ${context}\n\nGenerate the complete implementation with all files.` },
        ],
        max_tokens: 16384,
        temperature: 0.3,
      });
      const usage = response.usage;
      logApiCall({
        userId, model: "deepseek/deepseek-chat", worker: "builder",
        inputTokens: usage?.prompt_tokens || 0, outputTokens: usage?.completion_tokens || 0,
        durationMs: Date.now() - startTime, projectId, success: true,
      }).catch(() => {});
      return response.choices[0]?.message?.content || "Builder could not generate output.";
    } catch (error) {
      console.warn("[Builder] OpenRouter failed, falling back to Forge:", error);
    }
  }

  // Fallback 2: Forge LLM
  const result = await invokeLLM({
    messages: [
      { role: "system", content: BUILDER_SYSTEM_PROMPT },
      { role: "user", content: `Task: ${task}\n\nContext: ${context}\n\nGenerate the complete implementation.` },
    ],
  });
  const usage = result.usage;
  logApiCall({
    userId, model: "gemini-2.5-flash", worker: "builder",
    inputTokens: usage?.prompt_tokens || 0, outputTokens: usage?.completion_tokens || 0,
    durationMs: Date.now() - startTime, projectId, success: true,
  }).catch(() => {});
  const content = result.choices[0]?.message?.content;
  return typeof content === "string" ? content : JSON.stringify(content);
}

/**
 * Validator Worker — Anthropic Claude (code review & validation)
 */
export async function callValidator(code: string, requirements: string, userId: number = 1, projectId?: number): Promise<string> {
  const anthropic = getAnthropicClient();
  const startTime = Date.now();
  
  if (anthropic) {
    try {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: VALIDATOR_SYSTEM_PROMPT,
        messages: [
          { role: "user", content: `Requirements: ${requirements}\n\nGenerated Code:\n${code}\n\nPlease validate this output.` },
        ],
      });
      const usage = response.usage;
      logApiCall({
        userId, model: "claude-sonnet-4-20250514", worker: "validator",
        inputTokens: usage?.input_tokens || 0, outputTokens: usage?.output_tokens || 0,
        durationMs: Date.now() - startTime, projectId, success: true,
      }).catch(() => {});
      const textBlock = response.content.find(b => b.type === "text");
      return textBlock?.text || "Validation complete — no issues found.";
    } catch (error) {
      console.warn("[Validator] Anthropic failed, falling back to Forge:", error);
    }
  }

  // Fallback to Forge LLM
  const result = await invokeLLM({
    messages: [
      { role: "system", content: VALIDATOR_SYSTEM_PROMPT },
      { role: "user", content: `Requirements: ${requirements}\n\nGenerated Code:\n${code}\n\nPlease validate this output.` },
    ],
  });
  const usage = result.usage;
  logApiCall({
    userId, model: "gemini-2.5-flash", worker: "validator",
    inputTokens: usage?.prompt_tokens || 0, outputTokens: usage?.completion_tokens || 0,
    durationMs: Date.now() - startTime, projectId, success: true,
  }).catch(() => {});
  const content = result.choices[0]?.message?.content;
  return typeof content === "string" ? content : JSON.stringify(content);
}

/**
 * Research Worker — Perplexity Sonar (research & intelligence)
 * Uses the Perplexity API which is OpenAI-compatible
 */
export async function callResearch(query: string, userId: number = 1, projectId?: number): Promise<string> {
  const apiKey = getPerplexityApiKey();
  const startTime = Date.now();
  
  if (apiKey) {
    try {
      const response = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "sonar",
          messages: [
            { role: "system", content: RESEARCH_SYSTEM_PROMPT },
            { role: "user", content: query },
          ],
          max_tokens: 4096,
          temperature: 0.2,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Perplexity API error ${response.status}: ${errorText}`);
      }

      const data = await response.json() as { choices: Array<{ message: { content: string } }>; usage?: { prompt_tokens: number; completion_tokens: number } };
      logApiCall({
        userId, model: "sonar", worker: "research",
        inputTokens: data.usage?.prompt_tokens || 0, outputTokens: data.usage?.completion_tokens || 0,
        durationMs: Date.now() - startTime, projectId, success: true,
      }).catch(() => {});
      return data.choices[0]?.message?.content || "Research could not find relevant information.";
    } catch (error) {
      console.warn("[Research] Perplexity failed, falling back to Forge:", error);
    }
  }

  // Fallback to Forge LLM (without real-time search capability)
  const result = await invokeLLM({
    messages: [
      { role: "system", content: RESEARCH_SYSTEM_PROMPT + "\n\nNote: Real-time search is unavailable. Provide the best answer from your training data." },
      { role: "user", content: query },
    ],
  });
  const usage = result.usage;
  logApiCall({
    userId, model: "gemini-2.5-flash", worker: "research",
    inputTokens: usage?.prompt_tokens || 0, outputTokens: usage?.completion_tokens || 0,
    durationMs: Date.now() - startTime, projectId, success: true,
  }).catch(() => {});
  const content = result.choices[0]?.message?.content;
  return typeof content === "string" ? content : JSON.stringify(content);
}

/**
 * Captain's structured planning — uses OpenAI with JSON mode
 */
export async function callCaptainPlan(task: string, projectDescription: string): Promise<{
  phases: Array<{ name: string; description: string; worker: string }>;
  summary: string;
}> {
  const openai = getOpenAIClient();
  
  const defaultPlan = {
    phases: [
      { name: "Generate", description: task, worker: "builder" },
      { name: "Validate", description: "Review output for quality", worker: "validator" },
    ],
    summary: "Executing build task",
  };

  if (openai) {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: `${CAPTAIN_SYSTEM_PROMPT}\n\nYou must respond with a JSON object containing: { "phases": [{ "name": string, "description": string, "worker": "builder" | "validator" | "research" }], "summary": string }` },
          { role: "user", content: `Create an execution plan for: ${task}\n\nProject context: ${projectDescription || "New project"}` },
        ],
        response_format: { type: "json_object" },
        max_tokens: 2048,
        temperature: 0.5,
      });

      const content = response.choices[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content);
        if (parsed.phases && Array.isArray(parsed.phases)) {
          return parsed;
        }
      }
    } catch (error) {
      console.warn("[Captain Plan] OpenAI failed, using default plan:", error);
    }
  }

  // Fallback: try Forge with structured output
  try {
    const planResult = await invokeLLM({
      messages: [
        { role: "system", content: CAPTAIN_SYSTEM_PROMPT },
        { role: "user", content: `Create an execution plan for: ${task}\n\nProject context: ${projectDescription || "New project"}\n\nRespond with a JSON object containing: { "phases": [{ "name": string, "description": string, "worker": "builder" | "validator" | "research" }], "summary": string }` },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "execution_plan",
          strict: true,
          schema: {
            type: "object",
            properties: {
              phases: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    description: { type: "string" },
                    worker: { type: "string" },
                  },
                  required: ["name", "description", "worker"],
                  additionalProperties: false,
                },
              },
              summary: { type: "string" },
            },
            required: ["phases", "summary"],
            additionalProperties: false,
          },
        },
      },
    });

    const planContent = planResult.choices[0]?.message?.content;
    const parsed = JSON.parse(typeof planContent === "string" ? planContent : "{}");
    if (parsed.phases && Array.isArray(parsed.phases)) {
      return parsed;
    }
  } catch {
    // Use default plan
  }

  return defaultPlan;
}

// ─── Intent Detection ───────────────────────────────────────────────────────

export type WorkerIntent = "chat" | "build" | "research" | "validate" | "image_gen" | "social";

/**
 * Detect user intent to route to appropriate worker
 */
export function detectIntent(message: string): WorkerIntent {
  const lower = message.toLowerCase();
  
  // Research indicators (check first — most specific multi-word patterns)
  const researchKeywords = [
    "research", "find out", "look up", "what is", "who is", "how does",
    "market", "competitor", "trend", "latest", "news", "current",
    "compare", "analysis", "statistics", "data on", "information about",
  ];
  if (researchKeywords.some(kw => lower.includes(kw))) {
    return "research";
  }

  // Validate indicators
  const validateKeywords = [
    "review", "validate", "check my", "audit", "verify",
    "quality", "security", "accessibility", "performance check",
  ];
  if (validateKeywords.some(kw => lower.includes(kw))) {
    return "validate";
  }

    // Image generation indicators (check before build)
  const imageKeywords = [
    "generate image", "generate a image", "generate an image", "create image", "make image",
    "draw", "picture of", "illustration of", "art of", "generate art",
    "wall art", "coloring page", "poster of", "logo of", "generate a picture",
    "make a picture", "create a picture", "make me a", "generate me a",
  ];
  if (imageKeywords.some(kw => lower.includes(kw))) {
    return "image_gen";
  }
  // Social media posting indicators
  const socialKeywords = [
    "post to instagram", "post on instagram", "instagram post",
    "post to facebook", "post on facebook", "social media post",
    "queue post", "schedule post", "post this",
  ];
  if (socialKeywords.some(kw => lower.includes(kw))) {
    return "social";
  }
  // Build indicators
  const buildKeywords = [
    "build", "create", "generate", "make", "code", "develop",
    "website", "app", "dashboard", "api", "component", "page",
    "implement", "write code", "scaffold", "design",
  ];
  if (buildKeywords.some(kw => lower.includes(kw))) {
    return "build";
  }
  return "chat";
}
