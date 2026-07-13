/**
 * SSE Streaming endpoint for AI chat responses
 * Provides token-by-token streaming from OpenAI/Anthropic/Perplexity
 * Plus: browser, code execution, image generation, and multi-step chains
 */
import type { Express, Request, Response } from "express";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { addOrchestrationEvent } from "./db";
import { detectIntent, type WorkerIntent } from "./workers";
import { invokeLLM } from "./_core/llm";
import { clerkClient } from "@clerk/express";
import * as db from "./db";
import { executeCode, getExecutionEngineStatus } from "./codeExecutor";
import { executeBrowserTask, parseBrowserTask } from "./browserWorker";
import { generateImage, isImageRequest, extractImagePrompt } from "./imageWorker";
import { executeTaskChain } from "./taskChain";
import { retrieveRelevantMemories, buildMemoryContext, extractMemoriesFromMessage, persistExtractedMemories } from "./memoryService";
import { logApiCall, canAffordRequest, trackTaskCall, startTaskTracking, endTaskTracking } from "./costService";
import { analyzeComplexity, selectModel } from "./modelRouter";
import { createStateMachine, removeStateMachine } from "./stateMachine";
import { logger, startTrace, endTrace, recordMetric } from "./observability";
import { checkPromptInjection } from "./security";
import { semanticSearch, buildKnowledgeContext } from "./ragService";
import { getGlobalMemoryContext, extractAndStoreGlobalMemories } from "./supabaseMemoryService";
import { getRAGContext } from "./knowledgeBaseService";
import { getCachedAIResponse, cacheAIResponse, checkRateLimit, getCachedUserMemory, cacheUserMemory } from "./redis";
import { OWNER_EMAILS } from "./_core/env";
import { canAfford, deductCredits, getCreditBalance } from "./services/credits";
import { processMessageForMemory, recallProtectedMemories } from "./twoTierMemory";
import { recordMessage as recordSessionMessage, recordToolCall as recordSessionToolCall, recordFailure as recordSessionFailure } from "./sessionHealth";
import { verifyResponse, shouldVerify, generateBadge } from "./synthesisVerification";
import { createHeartbeatState, feedTokens, getHeartbeatStatus, getProgressPercent } from "./heartbeatInterrupt";
import { OWNER_CONTEXT } from "./ownerContext";

const CAPTAIN_SYSTEM_PROMPT = `You are Captain Q — Anthony's AI co-pilot and the brain behind Quoratorium.

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

CRITICAL — WHEN TO BUILD vs WHEN TO CHAT:
- ONLY produce code when the user EXPLICITLY asks you to build, create, code, or make something.
- If someone says "what time is it" or asks a question — just ANSWER. No code.
- If someone says "hey how's it going" — just CHAT. No code.
- If someone asks "can you explain X" — just EXPLAIN. No code.
- Code ONLY appears when the user says: "build me", "create", "make", "code this", "write a script", "generate a page", etc.
- When you DO build: ship complete code immediately. No plans, no ETAs, no "I'll work on this."

Your voice: Smart friend at a whiteboard. Casual but precise. Confident but not arrogant. You're the Captain — act like one.`;

const BUILDER_SYSTEM_PROMPT = `You are the Builder worker in Q Workspace. You generate high-quality code, create project structures, and implement features. When asked to build something, provide complete, production-ready code with proper file structure. Use React + Tailwind + Vite as default stack for web projects.`;

const VALIDATOR_SYSTEM_PROMPT = `You are the Validator worker in Q Workspace. You review code for quality, security, accessibility, and best practices. Provide constructive feedback with specific suggestions for improvement.`;

const RESEARCH_SYSTEM_PROMPT = `You are the Research worker in Q Workspace powered by Perplexity Sonar. You find information, analyze trends, compare options, and provide data-driven insights. Be thorough and cite sources when possible.`;

export type ExtendedIntent = WorkerIntent | "browser" | "execute" | "image" | "complex";

function getSystemPrompt(intent: ExtendedIntent): string {
  switch (intent) {
    case "build": return BUILDER_SYSTEM_PROMPT;
    case "validate": return VALIDATOR_SYSTEM_PROMPT;
    case "research": return RESEARCH_SYSTEM_PROMPT;
    default: return CAPTAIN_SYSTEM_PROMPT;
  }
}

function getWorkerName(intent: ExtendedIntent): string {
  const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;
  switch (intent) {
    case "build": return hasOpenRouter ? "Builder (DeepSeek)" : "Builder (OpenAI GPT-4o)";
    case "validate": return hasOpenRouter ? "Validator (Gemini 2.5 Flash)" : "Validator (Anthropic Claude)";
    case "research": return hasOpenRouter ? "Research (Gemini 2.5 Flash)" : "Research (Perplexity Sonar)";
    case "browser": return "Browser (Playwright)";
    case "execute": return `Executor (${process.env.SPRITES_TOKEN ? "Sprites.dev" : "Local Sandbox"})`;
    case "image": return "Artist (DALL-E 3)";
    case "complex": return "Captain Q (Multi-Step)";
    default: return hasOpenRouter ? "Captain Q (DeepSeek)" : "Captain Q (OpenAI GPT-4o)";
  }
}

/**
 * Extended intent detection that includes new workers
 */
function detectExtendedIntent(message: string): ExtendedIntent {
  const lower = message.toLowerCase();

  // Image generation
  if (isImageRequest(message)) return "image";

  // Browser tasks (must contain a URL)
  if (parseBrowserTask(message) !== null) return "browser";

  // Code execution
  const execKeywords = ["run this code", "execute this", "run the following", "execute code", "test this code"];
  if (execKeywords.some(kw => lower.includes(kw))) return "execute";
  // Also detect code blocks with explicit run request
  if (lower.includes("```") && (lower.includes("run") || lower.includes("execute"))) return "execute";

  // Complex multi-step tasks (long requests with multiple parts)
  const complexIndicators = [
    "step by step", "multiple steps", "first.*then", "build.*and.*deploy",
    "create.*and.*test", "research.*then.*build", "full project",
    "end to end", "complete workflow",
  ];
  if (complexIndicators.some(kw => lower.match(new RegExp(kw)))) return "complex";

  // Fall back to standard intent detection
  return detectIntent(message);
}

export function registerStreamingRoutes(app: Express) {
  // Sprites/execution engine status endpoint
  app.get("/api/sprites/status", async (_req: Request, res: Response) => {
    try {
      const status = await getExecutionEngineStatus();
      res.json(status);
    } catch (error: any) {
      res.json({ engine: "local", available: true, error: error?.message });
    }
  });

  // Main streaming chat endpoint
  app.post("/api/stream/chat", async (req: Request, res: Response) => {
    const { message, projectId, conversationId, history } = req.body;
    if (!message) {
      res.status(400).json({ error: "Message required" });
      return;
    }

    // Authenticate user from Clerk session (with owner bypass)
    let userId: number | null = null;
    let isGuest = true;
    try {
      const clerkAuth = (req as any).auth;
      if (clerkAuth?.userId) {
        const dbUser = await db.getUserByClerkId(clerkAuth.userId);
        if (dbUser?.id) {
          userId = dbUser.id;
          isGuest = false;
        }
      }
    } catch {
      // Continue as guest
    }

    // Owner bypass: resolve owner user when Clerk is unavailable
    if (!userId) {
      try {
        const ownerOpenId = process.env.OWNER_OPEN_ID;
        if (ownerOpenId) {
          let ownerUser = await db.getUserByClerkId(ownerOpenId);
          if (!ownerUser) {
            await db.upsertUser({
              clerkId: ownerOpenId,
              name: process.env.OWNER_NAME || "Owner",
              email: null,
              loginMethod: "owner_bypass",
              lastSignedIn: new Date(),
              role: "admin",
            });
            ownerUser = await db.getUserByClerkId(ownerOpenId);
          }
          if (ownerUser?.id) {
            userId = ownerUser.id;
            isGuest = false;
          }
        }
      } catch {
        // Non-blocking: proceed as guest if owner bypass fails
      }
    }

    // Resolve or create the conversation on the server, then persist the user message.
    // This deliberately uses the streaming endpoint's authenticated database user rather
    // than relying on client-side protected tRPC mutations.
    let persistedConversationId: number | null = null;
    if (userId) {
      try {
        const requestedConversationId =
          typeof conversationId === "number" && Number.isInteger(conversationId) && conversationId > 0
            ? conversationId
            : null;
        const normalizedProjectId =
          typeof projectId === "number" && Number.isInteger(projectId) && projectId > 0
            ? projectId
            : null;
        const title = message.trim().replace(/\s+/g, " ").slice(0, 80) || "New conversation";

        if (requestedConversationId) {
          const existingConversation = await db.getConversationForUser(requestedConversationId, userId);
          if (existingConversation) {
            persistedConversationId = existingConversation.id;
            if (!existingConversation.title) {
              await db.updateConversationTitle(existingConversation.id, userId, title);
            }
          } else {
            logger.warn(`[Conversation] Ignoring inaccessible conversation ${requestedConversationId}`, {
              userId,
            });
          }
        }

        if (!persistedConversationId) {
          persistedConversationId = await db.createConversation({
            userId,
            title,
            projectId: normalizedProjectId,
          });
        }

        await db.addConversationMessage({
          userId,
          conversationId: persistedConversationId,
          role: "user",
          content: message,
        });
      } catch (error: any) {
        logger.error(`[Conversation] Failed to persist user message: ${error?.message || error}`, {
          userId,
        });
        persistedConversationId = null;
      }
    }

    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    if (persistedConversationId) {
      res.write(`data: ${JSON.stringify({ type: "conversation_id", conversationId: persistedConversationId })}\n\n`);
    }

    const intent = detectExtendedIntent(message);
    const workerName = getWorkerName(intent);

    // ─── Budget Check ────────────────────────────────────────────────
    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    startTaskTracking(taskId);

    // ─── State Machine ──────────────────────────────────────────────
    const sm = createStateMachine(taskId, { maxRetries: 3, timeoutMs: 120_000 });
    sm.start(message.slice(0, 200));

    // ─── Observability Span ─────────────────────────────────────────
    const span = startTrace("chat_request", { service: "streaming", worker: workerName, attributes: { intent } });
    logger.info(`[Stream] New request: intent=${intent}, worker=${workerName}`, { correlationId: taskId, worker: workerName });
    recordMetric("chat_requests_total", 1, "counter", { intent });

    // ─── Security: Prompt Injection Check ────────────────────────────
    const injectionCheck = checkPromptInjection(message);
    if (!injectionCheck.safe) {
      logger.warn(`[Security] Prompt injection detected (score: ${injectionCheck.score})`, { correlationId: taskId });
      res.write(`data: ${JSON.stringify({ type: "error", content: "Your message was flagged by our security system. Please rephrase your request." })}\n\n`);
      res.write(`data: [DONE]\n\n`);
      res.end();
      sm.failPlanning("Prompt injection detected");
      endTrace(span, "failed");
      endTaskTracking(taskId);
      removeStateMachine(taskId);
      return;
    }

    // ─── Owner Detection ──────────────────────────────────────────────────
    // Owner gets unlimited credits — skip all checks
    // Bypass 1: match by OWNER_OPEN_ID (Manus platform)
    // Bypass 2: match by email (wisheswithoutbordersco@gmail.com)
    let _isOwner = false;
    if (!isGuest && userId) {
      try {
        const ownerOpenId = process.env.OWNER_OPEN_ID;
        if (ownerOpenId) {
          const ownerUser = await db.getUserByClerkId(ownerOpenId);
          _isOwner = !!(ownerUser && ownerUser.id === userId);
        }
        // Email-based bypass: check if the authenticated user's email is in the owner list
        if (!_isOwner) {
          const currentUser = await db.getUserById(userId);
          if (currentUser?.email && OWNER_EMAILS.includes(currentUser.email.toLowerCase())) {
            _isOwner = true;
          }
        }
      } catch { /* non-blocking */ }
    }

    // ─── Credit Check (only for authenticated non-owner users) ──────────────
    if (!isGuest && userId && !_isOwner) {
      try {
        const budgetCheck = await canAffordRequest(userId, 0.01);
        if (!budgetCheck.allowed) {
          res.write(`data: ${JSON.stringify({ type: "error", content: `Budget limit reached: ${budgetCheck.reason}` })}\n\n`);
          res.write(`data: [DONE]\n\n`);
          res.end();
          sm.failPlanning("Budget limit reached");
          endTrace(span, "failed");
          endTaskTracking(taskId);
          removeStateMachine(taskId);
          return;
        }
      } catch (err) {
        // Non-blocking: if budget check fails, proceed anyway
      }
      try {
        const creditOk = await canAfford(userId, 1);
        if (!creditOk) {
          const balance = await getCreditBalance(userId);
          res.write(`data: ${JSON.stringify({ type: "error", content: `You've used all your credits for today (${balance.dailyCreditsLimit} credits/day on the ${balance.plan} plan). Upgrade your plan or buy a top-up at /billing to continue.`, credit_exhausted: true, plan: balance.plan })}\n\n`);
          res.write(`data: [DONE]\n\n`);
          res.end();
          sm.failPlanning("Credits exhausted");
          endTrace(span, "failed");
          endTaskTracking(taskId);
          removeStateMachine(taskId);
          return;
        }
        // Deduct 1 credit for this AI action
        await deductCredits(userId, 1, "ai_chat");
      } catch (err) {
        // Non-blocking: if credit check fails, proceed anyway (graceful degradation)
      }
    }
    // Owner: unlimited credits — no deduction, no limit check
    // Guests: credit enforcement is client-side (localStorage limit)
    // ─── Rate Limiting (via Redis) ───────────────────────────────────────
    try {
      const rateCheck = _isOwner ? { allowed: true } : await checkRateLimit(String(userId || "guest"), "chat", 60, 60);
      if (!rateCheck.allowed) {
        res.write(`data: ${JSON.stringify({ type: "error", content: "Rate limit exceeded. Please wait a moment before sending another message." })}\n\n`);
        res.write(`data: [DONE]\n\n`);
        res.end();
        sm.failPlanning("Rate limit exceeded");
        endTrace(span, "failed");
        endTaskTracking(taskId);
        removeStateMachine(taskId);
        return;
      }
    } catch (err) {
      // Non-blocking: if rate limit check fails, proceed
    }

    // ─── Memory Retrieval (with Redis caching) ──────────────────────────────
    let memoryContext = "";
    let memoryCount = 0;
    let knowledgeContext = "";
    let knowledgeSources: string[] = [];

    // Memory & RAG only for authenticated users (guests get basic chat)
    if (!isGuest && userId) {
      try {
        // Check Redis cache first for user memory
        const cachedMemory = await getCachedUserMemory<{ context: string; count: number }>(String(userId));
        if (cachedMemory) {
          memoryContext = cachedMemory.context;
          memoryCount = cachedMemory.count;
        } else {
          const { memories, count } = await retrieveRelevantMemories(userId, message, { projectId: projectId || undefined });
          if (count > 0) {
            memoryContext = buildMemoryContext(memories);
            memoryCount = count;
            cacheUserMemory(String(userId), { context: memoryContext, count: memoryCount }).catch(() => {});
          }
        }
      } catch (err) {
        console.warn("[Memory] Retrieval failed:", err);
      }

      try {
        const globalMemory = await getGlobalMemoryContext(String(userId));
        if (globalMemory) {
          memoryContext = globalMemory + "\n" + memoryContext;
          memoryCount += 1;
        }
      } catch (err) {
        console.warn("[SupabaseMemory] Global memory retrieval failed:", err);
      }

      try {
        const ragResults = await semanticSearch(userId, message, 5);
        if (ragResults.length > 0) {
          knowledgeContext = buildKnowledgeContext(ragResults);
          knowledgeSources = Array.from(new Set(ragResults.map(r => r.filename)));
        }
      } catch (err) {
        console.warn("[RAG] Knowledge retrieval failed:", err);
      }

      // Auto-extract memories from user message (async, non-blocking)
      const extracted = extractMemoriesFromMessage(message);
      if (extracted.length > 0) {
        persistExtractedMemories(userId, extracted, projectId).catch(() => {});
      }

      // Supabase pgvector RAG context (supplements MySQL RAG)
      try {
        const pgvectorContext = await getRAGContext(String(userId), message);
        if (pgvectorContext) {
          knowledgeContext = knowledgeContext + "\n" + pgvectorContext;
        }
      } catch (err) {
        console.warn("[SupabaseRAG] pgvector retrieval failed:", err);
      }

      // ─── Patent 1: Recall Protected Memories (Two-Tier System) ───────────
      // This is the CRITICAL step that injects stored user identity, preferences,
      // names, credentials, etc. into the conversation context.
      try {
        const protectedContext = await recallProtectedMemories(String(userId), message);
        if (protectedContext) {
          memoryContext = protectedContext + "\n" + memoryContext;
          memoryCount += 1;
          // Invalidate Redis cache so fresh memories are always used
          cacheUserMemory(String(userId), { context: memoryContext, count: memoryCount }).catch(() => {});
        }
      } catch (err) {
        console.warn("[TwoTierMemory] Protected recall failed:", err);
      }
    }

    // Send initial event with worker info
    res.write(`data: ${JSON.stringify({ type: "start", worker: workerName, intent })}\n\n`);

    // Send memory active event
    if (memoryCount > 0) {
      res.write(`data: ${JSON.stringify({ type: "memory_active", count: memoryCount })}\n\n`);
    }

    // Send knowledge active event
    if (knowledgeSources.length > 0) {
      res.write(`data: ${JSON.stringify({ type: "knowledge_active", sources: knowledgeSources })}\n\n`);
    }

    // Persist orchestration event: worker spawned
    if (projectId && userId) {
      addOrchestrationEvent({
        project_id: projectId,
        user_id: userId,
        event_type: "agent_spawned",
        agent_name: workerName,
        summary: `Routing to ${workerName} for: ${message.slice(0, 80)}`,
        payload: { intent, worker: workerName },
      }).catch(() => {});
    }

    // Persist user message (handled by ConversationPanel now via tRPC)
    // Patent 1: Process message through two-tier memory (async, non-blocking)
    if (!isGuest && userId) {
      processMessageForMemory(String(userId), message).catch(() => {});
    }

    sm.setPlan({ taskId, objective: message.slice(0, 200), steps: [{ id: "step_1", name: intent, worker: workerName, input: message.slice(0, 100), dependencies: [], status: "pending" }], estimatedComplexity: "low", createdAt: Date.now() });
    try {
      // Route to appropriate worker
      switch (intent) {
        case "image":
          await handleImageGeneration(res, message, projectId);
          break;
        case "browser":
          await handleBrowserTask(res, message, projectId);
          break;
        case "execute":
          await handleCodeExecution(res, message, projectId);
          break;
        case "complex":
          await handleMultiStepChain(res, message, projectId, memoryContext + knowledgeContext);
          break;
        default:
          await handleStandardChat(
            res,
            message,
            intent,
            history,
            projectId,
            memoryContext + knowledgeContext,
            userId,
            persistedConversationId
          );
          break;
      }
    } catch (error: any) {
      logger.error(`[Stream Error] ${error?.message || error}`, { correlationId: taskId, worker: workerName });
      sm.failExecution(error?.message || "Unknown error");
      endTrace(span, "failed");
      recordMetric("chat_errors_total", 1, "counter", { intent });
      res.write(`data: ${JSON.stringify({ type: "error", content: "An error occurred while processing your request." })}\n\n`);
      res.write(`data: [DONE]\n\n`);
      res.end();
      endTaskTracking(taskId);
      removeStateMachine(taskId);
      return;
    }

    sm.completeExecution();
    endTrace(span, "completed");
    recordMetric("chat_success_total", 1, "counter", { intent });
    endTaskTracking(taskId);
    removeStateMachine(taskId);

    // ─── Session Health: Record message exchange ────────────────────────
    if (!isGuest && userId) {
      const sessionKey = projectId ? `${userId}_${projectId}` : `${userId}_default`;
      const responseTime = Date.now() - (sm as any)?.startedAt || 3000;
      const estimatedTokens = Math.ceil(message.length / 4) + 500; // rough estimate
      recordSessionMessage(
        sessionKey,
        estimatedTokens,
        message,
        responseTime
      );
    }

    // Supabase global memory extraction (async, non-blocking)
    // Learns user preferences from this exchange for future personalization
    if (!isGuest && userId) {
      extractAndStoreGlobalMemories(
        String(userId),
        message,
        `User interacted with ${workerName} worker (intent: ${intent}). The task was completed successfully.`
      ).catch(() => {});
    }

    // Patent 2: Synthesis verification is handled within handleStandardChat
    // (fullResponse and messages are only available inside that function scope)

    // Persist completed orchestration event
    if (projectId && userId) {
      addOrchestrationEvent({
        project_id: projectId,
        user_id: userId,
        event_type: "agent_completed",
        agent_name: workerName,
        summary: `${workerName} completed response`,
        payload: { intent, worker: workerName },
      }).catch(() => {});
    }
  });

  // Code execution endpoint (direct)
  app.post("/api/execute", async (req: Request, res: Response) => {
    const { code, language } = req.body;
    if (!code || !language) {
      res.status(400).json({ error: "Code and language required" });
      return;
    }
    const validLangs = ["javascript", "typescript", "python"];
    if (!validLangs.includes(language)) {
      res.status(400).json({ error: `Unsupported language. Use: ${validLangs.join(", ")}` });
      return;
    }
    const result = await executeCode(code, language);
    res.json(result);
  });

  // Image generation endpoint (direct)
  app.post("/api/generate-image", async (req: Request, res: Response) => {
    const { prompt, size, quality, style } = req.body;
    if (!prompt) {
      res.status(400).json({ error: "Prompt required" });
      return;
    }
    const result = await generateImage(prompt, { size, quality, style });
    res.json(result);
  });
}

// ─── Handler Functions ──────────────────────────────────────────────────────

async function handleImageGeneration(res: Response, message: string, projectId: number | null) {
  const prompt = extractImagePrompt(message);
  res.write(`data: ${JSON.stringify({ type: "token", content: `🎨 Generating image: "${prompt}"...\n\n` })}\n\n`);

  const result = await generateImage(prompt);

  if (result.success && result.imageUrl) {
    res.write(`data: ${JSON.stringify({ type: "image", url: result.imageUrl, revisedPrompt: result.revisedPrompt })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: "token", content: `\n\n✅ Image generated successfully.\n\n**Prompt used:** ${result.revisedPrompt || prompt}\n\n**Storage:** ${result.storageKey ? "Saved to vault" : "Inline display"}` })}\n\n`);
  } else {
    res.write(`data: ${JSON.stringify({ type: "token", content: `❌ Image generation failed: ${result.error}` })}\n\n`);
  }

  res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
  res.write(`data: [DONE]\n\n`);
  res.end();
}

async function handleBrowserTask(res: Response, message: string, projectId: number | null) {
  const task = parseBrowserTask(message);
  res.write(`data: ${JSON.stringify({ type: "token", content: `🌐 Browser worker activated...\n\n**Action:** ${task?.action || "extract"}\n**URL:** ${task?.url || "unknown"}\n\n` })}\n\n`);

  const result = await executeBrowserTask(message);

  if (result.success) {
    if (result.type === "screenshot") {
      res.write(`data: ${JSON.stringify({ type: "image", url: `data:image/png;base64,${result.content}`, title: result.title })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: "token", content: `\n\n✅ Screenshot captured: **${result.title}**\nURL: ${result.url}` })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ type: "token", content: `✅ **${result.title || "Page"}** (${result.url})\n\n\`\`\`\n${result.content.slice(0, 5000)}\n\`\`\`` })}\n\n`);
    }
  } else {
    res.write(`data: ${JSON.stringify({ type: "token", content: `❌ Browser task failed: ${result.error}\n\nNote: The browser worker requires Chromium to be installed in the deployment environment. This feature works best in development.` })}\n\n`);
  }

  res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
  res.write(`data: [DONE]\n\n`);
  res.end();
}

async function handleCodeExecution(res: Response, message: string, projectId: number | null) {
  // Extract code block from message
  const codeMatch = message.match(/```(\w+)?\n([\s\S]*?)```/);
  if (!codeMatch) {
    res.write(`data: ${JSON.stringify({ type: "token", content: "❌ No code block found. Please wrap your code in triple backticks:\n\n\\`\\`\\`javascript\nconsole.log('hello');\n\\`\\`\\`" })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.write(`data: [DONE]\n\n`);
    res.end();
    return;
  }

  const langHint = (codeMatch[1] || "javascript").toLowerCase();
  const code = codeMatch[2];
  const language: "javascript" | "typescript" | "python" | "bash" = 
    langHint === "python" || langHint === "py" ? "python" :
    langHint === "typescript" || langHint === "ts" ? "typescript" :
    langHint === "bash" || langHint === "sh" || langHint === "shell" ? "bash" : "javascript";

  const engineLabel = process.env.SPRITES_TOKEN ? "Sprites.dev" : "Local Sandbox";
  res.write(`data: ${JSON.stringify({ type: "token", content: `⚡ Executing ${language} code via **${engineLabel}**...\n\n` })}\n\n`);

  const result = await executeCode(code, language);

  const engineInfo = result.engine === "sprites" 
    ? ` | Engine: Sprites.dev${result.spriteName ? ` (${result.spriteName})` : ""}` 
    : " | Engine: Local";

  if (result.success) {
    const output = result.stdout || "(no output)";
    res.write(`data: ${JSON.stringify({ type: "execution", language, success: true, stdout: result.stdout, stderr: result.stderr, duration: result.duration, engine: result.engine, spriteName: result.spriteName })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: "token", content: `✅ **Execution successful** (${result.duration}ms${engineInfo})\n\n\`\`\`\n${output}\n\`\`\`` })}\n\n`);
  } else {
    res.write(`data: ${JSON.stringify({ type: "execution", language, success: false, stdout: result.stdout, stderr: result.stderr, duration: result.duration, timedOut: result.timedOut, engine: result.engine })}\n\n`);
    const errorMsg = result.timedOut ? "⏱️ Execution timed out (30s limit)" : `❌ Execution failed`;
    res.write(`data: ${JSON.stringify({ type: "token", content: `${errorMsg}${engineInfo}\n\n\`\`\`\n${result.stderr || result.stdout || "Unknown error"}\n\`\`\`` })}\n\n`);
  }

  if (result.stderr && result.success) {
    res.write(`data: ${JSON.stringify({ type: "token", content: `\n\n⚠️ Warnings:\n\`\`\`\n${result.stderr}\n\`\`\`` })}\n\n`);
  }

  res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
  res.write(`data: [DONE]\n\n`);
  res.end();
}

async function handleMultiStepChain(res: Response, message: string, projectId: number | null, memoryContext: string = "") {
  res.write(`data: ${JSON.stringify({ type: "token", content: "🔗 **Captain Q: Multi-Step Task Chain**\n\nAnalyzing your request and creating an execution plan...\n\n" })}\n\n`);

  const result = await executeTaskChain(
    message,
    "Q Workspace project",
    1, // userId
    projectId,
    (step, index, total) => {
      // Send progress updates
      const statusEmoji = step.status === "completed" ? "✅" : step.status === "running" ? "⏳" : step.status === "failed" ? "❌" : "🔄";
      res.write(`data: ${JSON.stringify({ type: "progress", step: index + 1, total, name: step.name, status: step.status })}\n\n`);
      if (step.status === "running") {
        res.write(`data: ${JSON.stringify({ type: "token", content: `\n${statusEmoji} **Step ${index + 1}/${total}: ${step.name}**\n_Worker: ${step.worker}_\n\n` })}\n\n`);
      }
    }
  );

  // Send final results
  res.write(`data: ${JSON.stringify({ type: "token", content: `\n\n---\n\n## Task Chain Results\n\n**Duration:** ${Math.round(result.totalDuration / 1000)}s\n**Steps:** ${result.steps.filter(s => s.status === "completed").length}/${result.steps.length} completed\n\n` })}\n\n`);

  // Send each step's result
  for (const step of result.steps) {
    if (step.result) {
      res.write(`data: ${JSON.stringify({ type: "token", content: `### ${step.name}\n${step.result.slice(0, 2000)}\n\n` })}\n\n`);
    }
  }

  res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
  res.write(`data: [DONE]\n\n`);
  res.end();
}

async function handleStandardChat(
  res: Response,
  message: string,
  intent: ExtendedIntent,
  history: any,
  projectId: number | null,
  memoryContext: string = "",
  userId?: number | null,
  conversationId?: number | null
) {
  const basePrompt = getSystemPrompt(intent);
  const systemPrompt = memoryContext ? basePrompt + OWNER_CONTEXT + memoryContext : basePrompt + OWNER_CONTEXT;
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
  ];

  if (history && Array.isArray(history)) {
    for (const msg of history.slice(-10)) {
      messages.push({ role: msg.role as "user" | "assistant", content: msg.content });
    }
  }
  messages.push({ role: "user", content: message });

  // ─── Autonomous Tool Use (for build intent) ───────────────────────────────
  // When Captain Q is building, he can autonomously create files, run code, deploy
  if (intent === "build" && userId) {
    try {
      const { runToolLoop } = await import("./tools/index");
      const toolContext: import("./tools/index").ToolContext = {
        userId: String(userId),
        projectId,
        res,
      };

      // Emit tool-use start event
      res.write(`data: ${JSON.stringify({ type: "tool_mode", active: true })}\n\n`);

      const toolResult = await runToolLoop(
        messages as any,
        toolContext,
        process.env.OPENROUTER_API_KEY ? "deepseek/deepseek-chat" : undefined,
        // onToken: stream tokens as they arrive
        (token: string) => {
          res.write(`data: ${JSON.stringify({ type: "token", content: token })}\n\n`);
        },
        // onToolStart: notify client which tool is being used
        (toolName: string, args: Record<string, any>) => {
          res.write(`data: ${JSON.stringify({ type: "tool_start", tool: toolName, args: Object.keys(args) })}\n\n`);
        },
        // onToolResult: notify client of tool completion
        (toolName: string, result: import("./tools/index").ToolResult) => {
          const artifacts = result.artifacts?.map(a => ({ type: a.type, name: a.name, url: a.url })) || [];
          res.write(`data: ${JSON.stringify({ type: "tool_result", tool: toolName, success: result.success, artifacts })}\n\n`);
          // If a sandbox URL was produced, send it as a preview event
          const urlArtifact = result.artifacts?.find(a => a.type === "url" && a.url);
          if (urlArtifact?.url) {
            res.write(`data: ${JSON.stringify({ type: "sandbox_url", url: urlArtifact.url, name: urlArtifact.name })}\n\n`);
          }
        },
      );

      // Stream the final text response if tool loop produced one
      if (toolResult.response && toolResult.toolsUsed.length > 0) {
        res.write(`data: ${JSON.stringify({ type: "token", content: toolResult.response })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: "tool_mode", active: false, toolsUsed: toolResult.toolsUsed })}\n\n`);
        if (userId && conversationId) {
          try {
            await db.addConversationMessage({
              userId,
              conversationId,
              role: "assistant",
              content: toolResult.response,
              metadata: { intent, toolsUsed: toolResult.toolsUsed },
            });
          } catch (error: any) {
            logger.error(`[Conversation] Failed to persist tool response: ${error?.message || error}`, {
              userId,
              metadata: { conversationId },
            });
          }
        }
        res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
        res.write(`data: [DONE]\n\n`);
        res.end();
        return;
      }
      // If no tools were used (LLM decided tools weren't needed), fall through to normal flow
    } catch (toolErr: any) {
      console.warn("[ToolLoop] Tool use failed, falling back to standard chat:", toolErr?.message);
      // Fall through to standard streaming
    }
  }

  // For build intent: collect full response to post-process (auto-execute + persist files)
  let fullResponse = "";
  const isBuildIntent = intent === "build";

  // Route to appropriate worker based on intent
  // Priority: OpenRouter (primary) → individual keys → Forge (fallback)
  try {
    if (process.env.OPENROUTER_API_KEY) {
      // Use OpenRouter as primary for all intents
      const model = intent === "build"
        ? "deepseek/deepseek-chat"
        : intent === "validate"
          ? "google/gemini-2.5-flash"
          : intent === "research"
            ? "google/gemini-2.5-flash"
            : "deepseek/deepseek-chat";
      fullResponse = await streamOpenRouterCollecting(res, messages, model);
    } else if ((intent === "validate") && process.env.ANTHROPIC_API_KEY) {
      fullResponse = await streamAnthropicCollecting(res, systemPrompt, message, history);
    } else if (intent === "research" && process.env.SONAR_API_KEY) {
      fullResponse = await streamPerplexityCollecting(res, messages, message);
    } else if (process.env.OPENAI_API_KEY) {
      fullResponse = await streamOpenAICollecting(res, messages);
    } else {
      fullResponse = await streamForgeFallbackCollecting(res, messages);
    }
  } catch (primaryError: any) {
    console.warn(`[Stream] Primary provider failed (${intent}), falling back to Forge:`, primaryError?.message || primaryError);
    fullResponse = await streamForgeFallbackCollecting(res, messages);
  }

  // ─── Post-Build: Auto-Execute + Persist Files ─────────────────────────────
  if (isBuildIntent && fullResponse) {
    // Extract code blocks from the generated response
    const codeBlocks = extractCodeBlocksFromMarkdown(fullResponse);
    if (codeBlocks.length > 0) {
      // Persist generated files to DB if we have a project
      if (projectId && userId) {
        try {
          res.write(`data: ${JSON.stringify({ type: "token", content: `\n\n---\n\n💾 **Persisting ${codeBlocks.length} generated file${codeBlocks.length !== 1 ? 's' : ''} to project...**\n` })}\n\n`);
          for (const block of codeBlocks) {
            await db.createGeneratedFile({
              project_id: projectId,
              user_id: userId,
              filename: block.filename,
              filepath: block.filepath,
              content: block.content,
              language: block.language,
            }).catch(() => {});
          }
          res.write(`data: ${JSON.stringify({ type: "token", content: `✅ **${codeBlocks.length} file${codeBlocks.length !== 1 ? 's' : ''} saved** to project #${projectId}\n` })}\n\n`);
        } catch (err) {
          console.warn("[Build] File persistence failed:", err);
        }
      }

      // Auto-execute in Sprites if there's a runnable script
      const runnableBlock = codeBlocks.find(b =>
        ["javascript", "typescript", "python", "bash"].includes(b.language) &&
        b.content.length > 20 &&
        !b.filename.includes(".test.") &&
        !b.filename.includes("package.json")
      );

      if (runnableBlock && process.env.SPRITES_TOKEN) {
        const lang = runnableBlock.language as "javascript" | "typescript" | "python" | "bash";
        const engineLabel = "Sprites.dev";
        res.write(`data: ${JSON.stringify({ type: "token", content: `\n⚡ **Auto-executing ${lang} via ${engineLabel}...**\n` })}\n\n`);
        try {
          const execResult = await executeCode(runnableBlock.content, lang, { timeoutMs: 30000 });
          const engineInfo = execResult.engine === "sprites" ? ` (${execResult.spriteName || "Sprites.dev"})` : " (local)";
          res.write(`data: ${JSON.stringify({ type: "execution", language: lang, success: execResult.success, stdout: execResult.stdout, stderr: execResult.stderr, duration: execResult.duration, engine: execResult.engine, spriteName: execResult.spriteName })}\n\n`);
          if (execResult.success) {
            res.write(`data: ${JSON.stringify({ type: "token", content: `✅ **Execution successful** (${execResult.duration}ms${engineInfo})\n\`\`\`\n${execResult.stdout || "(no output)"}\n\`\`\`` })}\n\n`);
          } else {
            res.write(`data: ${JSON.stringify({ type: "token", content: `⚠️ **Execution note** (${execResult.duration}ms${engineInfo}): ${execResult.stderr?.slice(0, 300) || "Check output above"}` })}\n\n`);
          }
        } catch (execErr: any) {
          console.warn("[Build] Auto-execution failed:", execErr?.message);
        }
      }
    }
  }

  if (fullResponse && userId && conversationId) {
    try {
      await db.addConversationMessage({
        userId,
        conversationId,
        role: "assistant",
        content: fullResponse,
        metadata: { intent },
      });
    } catch (error: any) {
      logger.error(`[Conversation] Failed to persist assistant message: ${error?.message || error}`, {
        userId,
        metadata: { conversationId },
      });
    }
  }

  if (!res.writableEnded) {
    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.write(`data: [DONE]\n\n`);
    res.end();
  }
}

/**
 * Extract code blocks from markdown for post-build processing
 */
function extractCodeBlocksFromMarkdown(markdown: string): Array<{ filename: string; filepath: string; content: string; language: string }> {
  const blocks: Array<{ filename: string; filepath: string; content: string; language: string }> = [];
  const regex = /```(\w+)?(?:\s+([^\n]+))?\n([\s\S]*?)```/g;
  let match;
  let index = 0;
  while ((match = regex.exec(markdown)) !== null) {
    const language = (match[1] || "text").toLowerCase();
    const filenameHint = match[2]?.trim() || "";
    const content = match[3]?.trim() || "";
    if (!content) continue;
    // Infer filename from hint or language
    const extMap: Record<string, string> = {
      javascript: "js", typescript: "ts", python: "py", html: "html",
      css: "css", json: "json", jsx: "jsx", tsx: "tsx",
      bash: "sh", shell: "sh", yaml: "yml", markdown: "md",
    };
    const ext = extMap[language] || language;
    const filename = filenameHint || `file${++index}.${ext}`;
    const filepath = filename.includes("/") ? filename : filename;
    blocks.push({ filename, filepath, content, language });
  }
  return blocks;
}

// ─── Streaming Functions ────────────────────────────────────────────────────

async function streamOpenRouter(
  res: Response,
  messages: Array<{ role: string; content: string }>,
  model: string = "deepseek/deepseek-chat"
) {
  const startTime = Date.now();
  const openrouter = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://quoratorium.com",
      "X-Title": "Quoratorium",
    },
  });
  const stream = await openrouter.chat.completions.create({
    model,
    messages: messages as any,
    stream: true,
    max_tokens: 4096,
    temperature: 0.7,
  });
  let totalTokens = { prompt: 0, completion: 0 };
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      res.write(`data: ${JSON.stringify({ type: "token", content: delta })}\n\n`);
    }
    if ((chunk as any).usage) {
      totalTokens.prompt = (chunk as any).usage.prompt_tokens || 0;
      totalTokens.completion = (chunk as any).usage.completion_tokens || 0;
    }
    if (chunk.choices[0]?.finish_reason === "stop") {
      break;
    }
  }
  logApiCall({
    userId: 0, model, worker: "captain",
    inputTokens: totalTokens.prompt, outputTokens: totalTokens.completion,
    durationMs: Date.now() - startTime, success: true,
  }).catch(() => {});
  res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
  res.write(`data: [DONE]\n\n`);
  res.end();
}

async function streamOpenAI(res: Response, messages: Array<{ role: string; content: string }>) {
  const startTime = Date.now();
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const stream = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: messages as any,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: 4096,
    temperature: 0.7,
  });
  let totalTokens = { prompt: 0, completion: 0 };
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      res.write(`data: ${JSON.stringify({ type: "token", content: delta })}\n\n`);
    }
    if (chunk.usage) {
      totalTokens.prompt = chunk.usage.prompt_tokens || 0;
      totalTokens.completion = chunk.usage.completion_tokens || 0;
    }
    if (chunk.choices[0]?.finish_reason === "stop") {
      break;
    }
  }
  logApiCall({
    userId: 0, model: "gpt-4o", worker: "captain",
    inputTokens: totalTokens.prompt, outputTokens: totalTokens.completion,
    durationMs: Date.now() - startTime, success: true,
  }).catch(() => {});
  res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
  res.write(`data: [DONE]\n\n`);
  res.end();
}

async function streamAnthropic(
  res: Response,
  messages: Array<{ role: string; content: string }>,
  systemPrompt: string,
  userMessage: string,
  history?: Array<{ role: string; content: string }>
) {
  const startTime = Date.now();
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const anthropicMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
  if (history && Array.isArray(history)) {
    for (const msg of history.slice(-10)) {
      anthropicMessages.push({ role: msg.role as "user" | "assistant", content: msg.content });
    }
  }
  anthropicMessages.push({ role: "user", content: userMessage });
  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: systemPrompt,
    messages: anthropicMessages,
  });
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      res.write(`data: ${JSON.stringify({ type: "token", content: event.delta.text })}\n\n`);
    }
  }
  const finalMessage = await stream.finalMessage();
  logApiCall({
    userId: 0, model: "claude-sonnet-4-20250514", worker: "validator",
    inputTokens: finalMessage.usage?.input_tokens || 0, outputTokens: finalMessage.usage?.output_tokens || 0,
    durationMs: Date.now() - startTime, success: true,
  }).catch(() => {});
  res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
  res.write(`data: [DONE]\n\n`);
  res.end();
}

async function streamPerplexity(
  res: Response,
  messages: Array<{ role: string; content: string }>,
  query: string
) {
  const startTime = Date.now();
  const perplexity = new OpenAI({
    apiKey: process.env.SONAR_API_KEY,
    baseURL: "https://api.perplexity.ai",
  });
  try {
    const stream = await perplexity.chat.completions.create({
      model: "sonar",
      messages: messages as any,
      stream: true,
      max_tokens: 4096,
    });
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        res.write(`data: ${JSON.stringify({ type: "token", content: delta })}\n\n`);
      }
      if (chunk.choices[0]?.finish_reason === "stop") {
        break;
      }
    }
    logApiCall({
      userId: 0, model: "sonar", worker: "research",
      inputTokens: Math.round(query.length / 4), outputTokens: 500,
      durationMs: Date.now() - startTime, success: true,
    }).catch(() => {});
  } catch (error: any) {
    console.warn("[Perplexity Stream] Falling back to non-streaming:", error?.message);
    const perplexityNonStream = new OpenAI({
      apiKey: process.env.SONAR_API_KEY,
      baseURL: "https://api.perplexity.ai",
    });
    const response = await perplexityNonStream.chat.completions.create({
      model: "sonar",
      messages: messages as any,
      max_tokens: 4096,
    });
    const usage = response.usage;
    logApiCall({
      userId: 0, model: "sonar", worker: "research",
      inputTokens: usage?.prompt_tokens || 0, outputTokens: usage?.completion_tokens || 0,
      durationMs: Date.now() - startTime, success: true,
    }).catch(() => {});
    const content = response.choices[0]?.message?.content || "No results found.";
    const words = content.split(" ");
    for (let i = 0; i < words.length; i += 3) {
      const chunk = words.slice(i, i + 3).join(" ") + " ";
      res.write(`data: ${JSON.stringify({ type: "token", content: chunk })}\n\n`);
    }
  }
  res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
  res.write(`data: [DONE]\n\n`);
  res.end();
}

async function streamForgeFallback(res: Response, messages: Array<{ role: string; content: string }>) {
  const startTime = Date.now();
  const result = await invokeLLM({
    messages: messages as any,
  });
  const usage = result.usage;
  logApiCall({
    userId: 0, model: "gemini-2.5-flash", worker: "captain",
    inputTokens: usage?.prompt_tokens || 0, outputTokens: usage?.completion_tokens || 0,
    durationMs: Date.now() - startTime, success: true,
  }).catch(() => {});
  const content = result.choices[0]?.message?.content;
  const text = typeof content === "string" ? content : JSON.stringify(content);
  const words = text.split(" ");
  for (let i = 0; i < words.length; i += 2) {
    const chunk = words.slice(i, i + 2).join(" ") + " ";
    res.write(`data: ${JSON.stringify({ type: "token", content: chunk })}\n\n`);
    await new Promise(r => setTimeout(r, 20));
  }
  res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
  res.write(`data: [DONE]\n\n`);
  res.end();
}

// ─── Collecting Variants (for build intent post-processing) ─────────────────
// These stream tokens to the client AND collect the full response for post-processing.
// The response is NOT ended here — the caller (handleStandardChat) ends it after post-build steps.

async function streamOpenRouterCollecting(
  res: Response,
  messages: Array<{ role: string; content: string }>,
  model: string = "deepseek/deepseek-chat"
): Promise<string> {
  const startTime = Date.now();
  const openrouter = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://quoratorium.com",
      "X-Title": "Quoratorium Builder",
    },
  });
  const stream = await openrouter.chat.completions.create({
    model,
    messages: messages as any,
    stream: true,
    max_tokens: 16384,
    temperature: 0.3,
  });
  let fullText = "";
  let totalTokens = { prompt: 0, completion: 0 };
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      fullText += delta;
      res.write(`data: ${JSON.stringify({ type: "token", content: delta })}\n\n`);
    }
    if ((chunk as any).usage) {
      totalTokens.prompt = (chunk as any).usage.prompt_tokens || 0;
      totalTokens.completion = (chunk as any).usage.completion_tokens || 0;
    }
    if (chunk.choices[0]?.finish_reason === "stop") break;
  }
  logApiCall({
    userId: 0, model, worker: "builder",
    inputTokens: totalTokens.prompt, outputTokens: totalTokens.completion,
    durationMs: Date.now() - startTime, success: true,
  }).catch(() => {});
  // Note: caller is responsible for writing done/end
  return fullText;
}

async function streamOpenAICollecting(
  res: Response,
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  const startTime = Date.now();
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const stream = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: messages as any,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: 16384,
    temperature: 0.3,
  });
  let fullText = "";
  let totalTokens = { prompt: 0, completion: 0 };
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      fullText += delta;
      res.write(`data: ${JSON.stringify({ type: "token", content: delta })}\n\n`);
    }
    if (chunk.usage) {
      totalTokens.prompt = chunk.usage.prompt_tokens || 0;
      totalTokens.completion = chunk.usage.completion_tokens || 0;
    }
    if (chunk.choices[0]?.finish_reason === "stop") break;
  }
  logApiCall({
    userId: 0, model: "gpt-4o", worker: "builder",
    inputTokens: totalTokens.prompt, outputTokens: totalTokens.completion,
    durationMs: Date.now() - startTime, success: true,
  }).catch(() => {});
  return fullText;
}

async function streamAnthropicCollecting(
  res: Response,
  systemPrompt: string,
  userMessage: string,
  history?: Array<{ role: string; content: string }>
): Promise<string> {
  const startTime = Date.now();
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const anthropicMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
  if (history && Array.isArray(history)) {
    for (const msg of history.slice(-10)) {
      anthropicMessages.push({ role: msg.role as "user" | "assistant", content: msg.content });
    }
  }
  anthropicMessages.push({ role: "user", content: userMessage });

  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: systemPrompt,
    messages: anthropicMessages,
  });
  let fullText = "";
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      fullText += event.delta.text;
      res.write(`data: ${JSON.stringify({ type: "token", content: event.delta.text })}\n\n`);
    }
  }
  const finalMessage = await stream.finalMessage();
  logApiCall({
    userId: 0,
    model: "claude-sonnet-4-20250514",
    worker: "validator",
    inputTokens: finalMessage.usage?.input_tokens || 0,
    outputTokens: finalMessage.usage?.output_tokens || 0,
    durationMs: Date.now() - startTime,
    success: true,
  }).catch(() => {});
  return fullText;
}

async function streamPerplexityCollecting(
  res: Response,
  messages: Array<{ role: string; content: string }>,
  query: string
): Promise<string> {
  const startTime = Date.now();
  const perplexity = new OpenAI({
    apiKey: process.env.SONAR_API_KEY,
    baseURL: "https://api.perplexity.ai",
  });
  let fullText = "";

  try {
    const stream = await perplexity.chat.completions.create({
      model: "sonar",
      messages: messages as any,
      stream: true,
      max_tokens: 4096,
    });
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        fullText += delta;
        res.write(`data: ${JSON.stringify({ type: "token", content: delta })}\n\n`);
      }
      if (chunk.choices[0]?.finish_reason === "stop") break;
    }
    logApiCall({
      userId: 0,
      model: "sonar",
      worker: "research",
      inputTokens: Math.round(query.length / 4),
      outputTokens: Math.round(fullText.length / 4),
      durationMs: Date.now() - startTime,
      success: true,
    }).catch(() => {});
  } catch (error: any) {
    console.warn("[Perplexity Stream] Falling back to non-streaming:", error?.message);
    const response = await perplexity.chat.completions.create({
      model: "sonar",
      messages: messages as any,
      max_tokens: 4096,
    });
    const content = response.choices[0]?.message?.content;
    fullText = typeof content === "string" ? content : "No results found.";
    const words = fullText.split(" ");
    for (let i = 0; i < words.length; i += 3) {
      const chunk = words.slice(i, i + 3).join(" ") + " ";
      res.write(`data: ${JSON.stringify({ type: "token", content: chunk })}\n\n`);
    }
    logApiCall({
      userId: 0,
      model: "sonar",
      worker: "research",
      inputTokens: response.usage?.prompt_tokens || 0,
      outputTokens: response.usage?.completion_tokens || 0,
      durationMs: Date.now() - startTime,
      success: true,
    }).catch(() => {});
  }

  return fullText;
}

async function streamForgeFallbackCollecting(
  res: Response,
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  const startTime = Date.now();
  const result = await invokeLLM({ messages: messages as any });
  const usage = result.usage;
  logApiCall({
    userId: 0, model: "gemini-2.5-flash", worker: "builder",
    inputTokens: usage?.prompt_tokens || 0, outputTokens: usage?.completion_tokens || 0,
    durationMs: Date.now() - startTime, success: true,
  }).catch(() => {});
  const content = result.choices[0]?.message?.content;
  const text = typeof content === "string" ? content : JSON.stringify(content);
  // Stream word by word
  const words = text.split(" ");
  for (let i = 0; i < words.length; i += 2) {
    const chunk = words.slice(i, i + 2).join(" ") + " ";
    res.write(`data: ${JSON.stringify({ type: "token", content: chunk })}\n\n`);
    await new Promise(r => setTimeout(r, 20));
  }
  return text;
}
