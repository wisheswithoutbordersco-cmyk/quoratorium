/**
 * SSE Streaming endpoint for AI chat responses
 * Provides token-by-token streaming from OpenAI/Anthropic/Perplexity
 * Plus: browser, code execution, image generation, and multi-step chains
 */
import type { Express, Request, Response } from "express";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { addOrchestrationEvent } from "./db";
import type { WorkerIntent } from "./workers";
import { invokeLLM } from "./_core/llm";
import type { Message as LLMMessage } from "./_core/llm";
import * as db from "./db";
import { executeCode, getExecutionEngineStatus } from "./codeExecutor";
import { executeBrowserTask, parseBrowserTask } from "./browserWorker";
import { generateImage, extractImagePrompt } from "./imageWorker";
import { executeTaskChain } from "./taskChain";
import { retrieveRelevantMemories, buildMemoryContext, extractMemoriesFromMessage, persistExtractedMemories } from "./memoryService";
import { saveToMemory, buildMemoryContext as buildSemanticMemoryContext } from "./memory-service";
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
import { getOwnerUser } from "./_core/context";
import { persistConversationAttachments } from "./chatAssets";
import { canAfford, deductCredits, getCreditBalance } from "./services/credits";
import { processMessageForMemory, recallProtectedMemories } from "./twoTierMemory";
import { recordMessage as recordSessionMessage, recordToolCall as recordSessionToolCall, recordFailure as recordSessionFailure } from "./sessionHealth";
import { verifyResponse, shouldVerify, generateBadge } from "./synthesisVerification";
import { createHeartbeatState, feedTokens, getHeartbeatStatus, getProgressPercent } from "./heartbeatInterrupt";
import { OWNER_CONTEXT } from "./ownerContext";
import { CAPTAIN_Q_SYSTEM_PROMPT } from "./captainQPrompt";
import { detectCaptainRoute, type CaptainRoute } from "./assistantRouting";
import {
  CAPTAIN_FORGE_MODEL,
  CAPTAIN_MAX_OUTPUT_TOKENS,
  CAPTAIN_OPENAI_MODEL,
  CAPTAIN_OPENROUTER_MODEL,
  getCaptainReasoning,
} from "./assistantConfig";
import {
  addImageAnalysisGuidance,
  attachmentMetadata,
  buildChatUserContent,
  normalizeChatHistory,
  parseChatAttachments,
  type ChatAttachment,
} from "./chatAttachments";

const CAPTAIN_SYSTEM_PROMPT = CAPTAIN_Q_SYSTEM_PROMPT;

const BUILDER_SYSTEM_PROMPT = `You are the Builder worker in Q Workspace. You generate high-quality code, create project structures, and implement features. When asked to build something, provide complete, production-ready code with proper file structure. Use React + Tailwind + Vite as default stack for web projects.`;

const VALIDATOR_SYSTEM_PROMPT = `You are the Validator worker in Q Workspace. You review code for quality, security, accessibility, and best practices. Provide constructive feedback with specific suggestions for improvement.`;

const RESEARCH_SYSTEM_PROMPT = `You are the Research worker in Q Workspace powered by Perplexity Sonar. You find information, analyze trends, compare options, and provide data-driven insights. Be thorough and cite sources when possible.`;

export type ExtendedIntent = CaptainRoute;

function getSystemPrompt(_intent: ExtendedIntent): string {
  return CAPTAIN_SYSTEM_PROMPT;
}

function getWorkerName(intent: ExtendedIntent): string {
  switch (intent) {
    case "browser": return "Captain Q · Browser";
    case "execute": return `Captain Q · Executor (${process.env.SPRITES_TOKEN ? "Sprites.dev" : "Local Sandbox"})`;
    default: return "Captain Q";
  }
}

/**
 * Only unmistakable side-effect requests bypass the general assistant. All
 * semantic interpretation—including research, images, writing, planning, and
 * tool selection—stays with the same Captain Q model.
 */
export function detectExtendedIntent(message: string, hasImageAttachment = false): ExtendedIntent {
  return detectCaptainRoute(message, hasImageAttachment);
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
    const {
      message: rawMessage,
      projectId,
      conversationId: bodyConversationId,
      history,
      attachments: rawAttachments,
    } = req.body || {};
    const parsedAttachments = parseChatAttachments(rawAttachments);
    let message = typeof rawMessage === "string" ? rawMessage.trim() : "";
    if (!message && parsedAttachments.imageAttachments.length > 0) {
      message = "Please describe the attached image.";
    }
    const queryConversationId =
      typeof req.query.conversationId === "string"
        ? Number(req.query.conversationId)
        : null;
    if (!message) {
      res.status(400).json({ error: "Message or supported image attachment required" });
      return;
    }

    // Keep ordinary Captain Q conversation on Anthony's existing owner workspace.
    // External business procedures use a separate short-lived action session.
    let userId: number | null = null;
    let isGuest = true;
    try {
      const owner = await getOwnerUser();
      if (owner?.id) {
        userId = owner.id;
        isGuest = false;
      }
    } catch (error: any) {
      console.error("[Conversation] Owner workspace resolution failed", {
        error: error?.stack || error?.message || error,
      });
    }

    if (!userId) {
      res.status(503).json({ error: "Owner workspace is temporarily unavailable." });
      return;
    }

    // Resolve or create the conversation on the server, then persist the user message.
    let persistedConversationId: number | null = null;
    let durableAttachmentIds: string[] = [];
    if (userId) {
      try {
        const requestedConversationId =
          typeof queryConversationId === "number" && Number.isInteger(queryConversationId) && queryConversationId > 0
            ? queryConversationId
            : typeof bodyConversationId === "number" && Number.isInteger(bodyConversationId) && bodyConversationId > 0
              ? bodyConversationId
              : null;
        const normalizedProjectId =
          typeof projectId === "number" && Number.isInteger(projectId) && projectId > 0
            ? projectId
            : null;
        const title = message.trim().replace(/\s+/g, " ").slice(0, 80) || "New conversation";

        console.log("[Conversation] Persistence attempt", {
          userId,
          requestedConversationId,
          projectId: normalizedProjectId,
        });

        if (requestedConversationId) {
          const existingConversation = await db.getConversationForUser(requestedConversationId, userId);
          if (existingConversation) {
            persistedConversationId = existingConversation.id;
            console.log("[Conversation] Reusing conversation", {
              userId,
              conversationId: persistedConversationId,
            });
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
          console.log("[Conversation] Creating conversation", { userId });
          persistedConversationId = await db.createConversation({
            userId,
            title,
            projectId: normalizedProjectId,
          });
          console.log("[Conversation] Conversation created", {
            userId,
            conversationId: persistedConversationId,
          });
        }

        const userMessageId = await db.addConversationMessage({
          userId,
          conversationId: persistedConversationId,
          role: "user",
          content: message,
          metadata: parsedAttachments.attachments.length > 0
            ? { attachments: attachmentMetadata(parsedAttachments.attachments) }
            : undefined,
        });

        if (parsedAttachments.attachments.length > 0) {
          try {
            const durableAttachments = await persistConversationAttachments({
              userId,
              conversationId: persistedConversationId,
              messageId: userMessageId,
              attachments: parsedAttachments.attachments,
            });
            if (durableAttachments.length > 0) {
              durableAttachmentIds = durableAttachments
                .filter(attachment => attachment.durable)
                .map(attachment => attachment.id);
              await db.updateConversationMessageMetadata({
                messageId: userMessageId,
                conversationId: persistedConversationId,
                userId,
                metadata: { attachments: durableAttachments },
              });
            }
          } catch (error) {
            console.warn("[Conversation] Durable attachment storage unavailable; continuing with this response", {
              conversationId: persistedConversationId,
              messageId: userMessageId,
              error,
            });
          }
        }

        console.log("[Conversation] User message saved", {
          userId,
          conversationId: persistedConversationId,
          messageId: userMessageId,
        });
      } catch (error: any) {
        console.error("[Conversation] Failed to persist conversation or user message", {
          userId,
          conversationId: persistedConversationId,
          error: error?.stack || error?.message || error,
        });
        persistedConversationId = null;
      }
    } else {
      console.error("[Conversation] Persistence skipped because no authenticated database user was resolved");
    }

    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    if (persistedConversationId) {
      res.write(`data: ${JSON.stringify({ type: "conversation_id", conversationId: persistedConversationId })}\n\n`);
    }

    // ─── Memory: Retrieve relevant context ─────────────────────
    let semanticMemoryContext = "";
    if (userId) {
      try {
        semanticMemoryContext = await buildSemanticMemoryContext(userId, message);
      } catch (e) {
        // Non-blocking
      }
    }

    const intent = detectExtendedIntent(message, parsedAttachments.imageAttachments.length > 0);
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
        case "browser":
          await handleBrowserTask(res, message, projectId, userId, persistedConversationId);
          break;
        case "execute":
          await handleCodeExecution(res, message, projectId, userId, persistedConversationId);
          break;
        default:
          await handleStandardChat(
            res,
            message,
            intent,
            history,
            projectId,
            memoryContext + knowledgeContext,
            semanticMemoryContext,
            userId,
            persistedConversationId,
            parsedAttachments.imageAttachments,
            durableAttachmentIds
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

async function persistAssistantConversationMessage(
  userId: number | null | undefined,
  conversationId: number | null | undefined,
  content: string,
  metadata: Record<string, any>
): Promise<void> {
  if (!userId || !conversationId) {
    console.error("[Conversation] Assistant message persistence skipped", {
      userId: userId ?? null,
      conversationId: conversationId ?? null,
      reason: "missing user or conversation",
    });
    return;
  }

  if (!content.trim()) {
    console.error("[Conversation] Assistant message persistence skipped", {
      userId,
      conversationId,
      reason: "empty response",
    });
    return;
  }

  console.log("[Conversation] Assistant message persistence attempt", {
    userId,
    conversationId,
    responseLength: content.length,
    intent: metadata.intent,
  });

  try {
    const messageId = await db.addConversationMessage({
      userId,
      conversationId,
      role: "assistant",
      content,
      metadata,
    });
    console.log("[Conversation] Assistant message saved", {
      userId,
      conversationId,
      messageId,
      responseLength: content.length,
    });
  } catch (error: any) {
    console.error("[Conversation] Failed to persist assistant message", {
      userId,
      conversationId,
      responseLength: content.length,
      error: error?.stack || error?.message || error,
    });
  }
}

async function handleImageGeneration(
  res: Response,
  message: string,
  projectId: number | null,
  userId: number | null,
  conversationId: number | null
) {
  const prompt = extractImagePrompt(message);
  let assistantResponse = `🎨 Generating image: "${prompt}"...\n\n`;
  res.write(`data: ${JSON.stringify({ type: "token", content: assistantResponse })}\n\n`);

  const result = await generateImage(prompt);

  if (result.success && result.imageUrl) {
    const completion = `\n\n✅ Image generated successfully.\n\n**Prompt used:** ${result.revisedPrompt || prompt}`;
    res.write(`data: ${JSON.stringify({ type: "image", url: result.imageUrl, title: "Generated image", revisedPrompt: result.revisedPrompt })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: "token", content: completion })}\n\n`);
    assistantResponse += completion;
  } else {
    const failure = `❌ Image generation failed: ${result.error}`;
    res.write(`data: ${JSON.stringify({ type: "token", content: failure })}\n\n`);
    assistantResponse += failure;
  }

  await persistAssistantConversationMessage(userId, conversationId, assistantResponse, {
    intent: "image",
    images: result.success && result.imageUrl
      ? [{ url: result.imageUrl, title: "Generated image" }]
      : [],
  });

  res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
  res.write(`data: [DONE]\n\n`);
  res.end();
}

async function handleBrowserTask(
  res: Response,
  message: string,
  projectId: number | null,
  userId: number | null,
  conversationId: number | null
) {
  const task = parseBrowserTask(message);
  let assistantResponse = `🌐 Browser worker activated...\n\n**Action:** ${task?.action || "extract"}\n**URL:** ${task?.url || "unknown"}\n\n`;
  res.write(`data: ${JSON.stringify({ type: "token", content: assistantResponse })}\n\n`);

  const result = await executeBrowserTask(message);

  if (result.success) {
    if (result.type === "screenshot") {
      const completion = `\n\n✅ Screenshot captured: **${result.title}**\nURL: ${result.url}`;
      res.write(`data: ${JSON.stringify({ type: "image", url: `data:image/png;base64,${result.content}`, title: result.title })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: "token", content: completion })}\n\n`);
      assistantResponse += completion;
    } else {
      const completion = `✅ **${result.title || "Page"}** (${result.url})\n\n\`\`\`\n${result.content.slice(0, 5000)}\n\`\`\``;
      res.write(`data: ${JSON.stringify({ type: "token", content: completion })}\n\n`);
      assistantResponse += completion;
    }
  } else {
    const failure = `❌ Browser task failed: ${result.error}\n\nNote: The browser worker requires Chromium to be installed in the deployment environment. This feature works best in development.`;
    res.write(`data: ${JSON.stringify({ type: "token", content: failure })}\n\n`);
    assistantResponse += failure;
  }

  await persistAssistantConversationMessage(userId, conversationId, assistantResponse, { intent: "browser" });

  res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
  res.write(`data: [DONE]\n\n`);
  res.end();
}

async function handleCodeExecution(
  res: Response,
  message: string,
  projectId: number | null,
  userId: number | null,
  conversationId: number | null
) {
  // Extract code block from message
  const codeMatch = message.match(/```(\w+)?\n([\s\S]*?)```/);
  if (!codeMatch) {
    const failure = "❌ No code block found. Please wrap your code in triple backticks:\n\n```javascript\nconsole.log('hello');\n```";
    res.write(`data: ${JSON.stringify({ type: "token", content: failure })}\n\n`);
    await persistAssistantConversationMessage(userId, conversationId, failure, { intent: "execute" });
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
  let assistantResponse = `⚡ Executing ${language} code via **${engineLabel}**...\n\n`;
  res.write(`data: ${JSON.stringify({ type: "token", content: assistantResponse })}\n\n`);

  const result = await executeCode(code, language);

  const engineInfo = result.engine === "sprites"
    ? ` | Engine: Sprites.dev${result.spriteName ? ` (${result.spriteName})` : ""}`
    : " | Engine: Local";

  if (result.success) {
    const output = result.stdout || "(no output)";
    const completion = `✅ **Execution successful** (${result.duration}ms${engineInfo})\n\n\`\`\`\n${output}\n\`\`\``;
    res.write(`data: ${JSON.stringify({ type: "execution", language, success: true, stdout: result.stdout, stderr: result.stderr, duration: result.duration, engine: result.engine, spriteName: result.spriteName })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: "token", content: completion })}\n\n`);
    assistantResponse += completion;
  } else {
    const errorMsg = result.timedOut ? "⏱️ Execution timed out (30s limit)" : "❌ Execution failed";
    const completion = `${errorMsg}${engineInfo}\n\n\`\`\`\n${result.stderr || result.stdout || "Unknown error"}\n\`\`\``;
    res.write(`data: ${JSON.stringify({ type: "execution", language, success: false, stdout: result.stdout, stderr: result.stderr, duration: result.duration, timedOut: result.timedOut, engine: result.engine })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: "token", content: completion })}\n\n`);
    assistantResponse += completion;
  }

  if (result.stderr && result.success) {
    const warnings = `\n\n⚠️ Warnings:\n\`\`\`\n${result.stderr}\n\`\`\``;
    res.write(`data: ${JSON.stringify({ type: "token", content: warnings })}\n\n`);
    assistantResponse += warnings;
  }

  await persistAssistantConversationMessage(userId, conversationId, assistantResponse, {
    intent: "execute",
    language,
    success: result.success,
  });

  res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
  res.write(`data: [DONE]\n\n`);
  res.end();
}

async function handleMultiStepChain(
  res: Response,
  message: string,
  projectId: number | null,
  memoryContext: string = "",
  userId: number | null,
  conversationId: number | null
) {
  let assistantResponse = "🔗 **Captain Q: Multi-Step Task Chain**\n\nAnalyzing your request and creating an execution plan...\n\n";
  res.write(`data: ${JSON.stringify({ type: "token", content: assistantResponse })}\n\n`);

  const result = await executeTaskChain(
    message,
    "Q Workspace project",
    userId || 1,
    projectId,
    (step, index, total) => {
      // Send progress updates
      const statusEmoji = step.status === "completed" ? "✅" : step.status === "running" ? "⏳" : step.status === "failed" ? "❌" : "🔄";
      res.write(`data: ${JSON.stringify({ type: "progress", step: index + 1, total, name: step.name, status: step.status })}\n\n`);
      if (step.status === "running") {
        const progress = `\n${statusEmoji} **Step ${index + 1}/${total}: ${step.name}**\n_Worker: ${step.worker}_\n\n`;
        res.write(`data: ${JSON.stringify({ type: "token", content: progress })}\n\n`);
        assistantResponse += progress;
      }
    }
  );

  // Send final results
  const summary = `\n\n---\n\n## Task Chain Results\n\n**Duration:** ${Math.round(result.totalDuration / 1000)}s\n**Steps:** ${result.steps.filter(s => s.status === "completed").length}/${result.steps.length} completed\n\n`;
  res.write(`data: ${JSON.stringify({ type: "token", content: summary })}\n\n`);
  assistantResponse += summary;

  // Send each step's result
  for (const step of result.steps) {
    if (step.result) {
      const stepResponse = `### ${step.name}\n${step.result.slice(0, 2000)}\n\n`;
      res.write(`data: ${JSON.stringify({ type: "token", content: stepResponse })}\n\n`);
      assistantResponse += stepResponse;
    }
  }

  await persistAssistantConversationMessage(userId, conversationId, assistantResponse, { intent: "complex" });

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
  semanticMemoryContext: string = "",
  userId?: number | null,
  conversationId?: number | null,
  imageAttachments: ChatAttachment[] = [],
  durableAttachmentIds: string[] = []
) {
  const basePrompt = getSystemPrompt(intent);
  let systemPrompt = memoryContext ? basePrompt + OWNER_CONTEXT + memoryContext : basePrompt + OWNER_CONTEXT;
  systemPrompt = addImageAnalysisGuidance(systemPrompt, imageAttachments.length);
  const messages: LLMMessage[] = [
    { role: "system", content: systemPrompt },
  ];

  if (semanticMemoryContext) {
    // Inject memory context into the system prompt
    const memoryNote = `\n\nYou have access to memory of past conversations. Use this context when relevant:\n${semanticMemoryContext}`;
    systemPrompt += memoryNote;
    if (messages[0]?.role === "system") {
      messages[0].content += memoryNote;
    } else {
      messages.unshift({ role: "system", content: memoryNote });
    }
  }

  messages.push(...normalizeChatHistory(history));
  messages.push({ role: "user", content: buildChatUserContent(message, imageAttachments) });

  let fullResponse = "";
  let toolsUsed: string[] = [];
  let generatedImages: Array<{ url: string; title: string }> = [];

  // One capable Captain Q model interprets the complete request and decides
  // whether a tool is needed. A valid no-tool answer is final; it is never
  // discarded and sent through a second, inconsistent model path.
  try {
    const { runToolLoop } = await import("./tools/index");
    const toolContext: import("./tools/index").ToolContext = {
      userId: String(userId || "owner"),
      projectId,
      conversationId,
      durableAttachmentIds,
      res,
    };
    let toolModeActive = false;

    const toolResult = await runToolLoop(
      messages as any,
      toolContext,
      CAPTAIN_OPENROUTER_MODEL,
      undefined,
      (toolName: string, args: Record<string, any>) => {
        if (!toolModeActive) {
          toolModeActive = true;
          res.write(`data: ${JSON.stringify({ type: "tool_mode", active: true })}\n\n`);
        }
        res.write(`data: ${JSON.stringify({ type: "tool_start", tool: toolName, args: Object.keys(args) })}\n\n`);
      },
      (toolName: string, result: import("./tools/index").ToolResult) => {
        const artifacts = result.artifacts?.map((artifact) => ({
          type: artifact.type,
          name: artifact.name,
          url: artifact.url,
        })) || [];
        res.write(`data: ${JSON.stringify({
          type: "tool_result",
          tool: toolName,
          success: result.success,
          artifacts,
          data: result.data,
        })}\n\n`);
        const urlArtifact = result.artifacts?.find((artifact) => artifact.type === "url" && artifact.url);
        if (urlArtifact?.url) {
          res.write(`data: ${JSON.stringify({ type: "sandbox_url", url: urlArtifact.url, name: urlArtifact.name })}\n\n`);
        }
      },
    );

    toolsUsed = toolResult.toolsUsed;
    generatedImages = toolResult.artifacts
      .filter((artifact) => artifact.type === "image" && artifact.url)
      .map((artifact) => ({ url: artifact.url!, title: artifact.name }));
    const preparedShopifyProposal = toolsUsed.includes("propose_shopify_product_draft");
    fullResponse = preparedShopifyProposal
      ? "I prepared the Shopify product draft proposal below for your review. Nothing was created or published. Unlock business actions when you are ready to review or edit the card."
      : toolResult.response?.trim() || (toolsUsed.length > 0
        ? "Done. I completed the requested action."
        : "I couldn't produce a useful response. Please try that again.");

    res.write(`data: ${JSON.stringify({ type: "token", content: fullResponse })}\n\n`);
    if (toolModeActive) {
      res.write(`data: ${JSON.stringify({ type: "tool_mode", active: false, toolsUsed })}\n\n`);
    }
  } catch (primaryError: any) {
    console.warn("[Captain Q] Unified reasoning loop failed, using direct model fallback:", primaryError?.message || primaryError);
    if (process.env.OPENROUTER_API_KEY) {
      fullResponse = await streamOpenRouterCollecting(res, messages, CAPTAIN_OPENROUTER_MODEL);
    } else if (process.env.OPENAI_API_KEY) {
      fullResponse = await streamOpenAICollecting(res, messages);
    } else {
      fullResponse = await streamForgeFallbackCollecting(res, messages);
    }
  }

  await persistAssistantConversationMessage(userId, conversationId, fullResponse, {
    intent,
    toolsUsed,
    images: generatedImages,
  });

  // ─── Memory: Save messages for future recall ─────────────
  if (userId) {
    saveToMemory({ userId, conversationId: conversationId || undefined, role: "user", content: message }).catch(() => {});
    if (fullResponse) {
      saveToMemory({ userId, conversationId: conversationId || undefined, role: "assistant", content: fullResponse }).catch(() => {});
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
    model: CAPTAIN_FORGE_MODEL,
    messages: messages as any,
    max_completion_tokens: CAPTAIN_MAX_OUTPUT_TOKENS,
    reasoning: getCaptainReasoning(CAPTAIN_FORGE_MODEL) as any,
  });
  const usage = result.usage;
  logApiCall({
    userId: 0, model: CAPTAIN_FORGE_MODEL, worker: "captain",
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
  messages: LLMMessage[],
  model: string = CAPTAIN_OPENROUTER_MODEL
): Promise<string> {
  const startTime = Date.now();
  const openrouter = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://quoratorium.com",
      "X-Title": "Captain Q",
    },
  });
  const reasoning = getCaptainReasoning(model);
  const stream = await openrouter.chat.completions.create({
    model,
    messages: messages as any,
    stream: true,
    max_completion_tokens: CAPTAIN_MAX_OUTPUT_TOKENS,
    ...(reasoning ? { reasoning } : {}),
  } as any) as unknown as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
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
    userId: 0, model, worker: "captain",
    inputTokens: totalTokens.prompt, outputTokens: totalTokens.completion,
    durationMs: Date.now() - startTime, success: true,
  }).catch(() => {});
  // Note: caller is responsible for writing done/end
  return fullText;
}

async function streamOpenAICollecting(
  res: Response,
  messages: LLMMessage[]
): Promise<string> {
  const startTime = Date.now();
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const stream = await openai.chat.completions.create({
    model: CAPTAIN_OPENAI_MODEL,
    messages: messages as any,
    stream: true,
    stream_options: { include_usage: true },
    max_completion_tokens: CAPTAIN_MAX_OUTPUT_TOKENS,
    reasoning_effort: "low",
  } as any) as unknown as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
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
    userId: 0, model: CAPTAIN_OPENAI_MODEL, worker: "captain",
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
  messages: LLMMessage[],
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
  messages: LLMMessage[]
): Promise<string> {
  const startTime = Date.now();
  const result = await invokeLLM({
    model: CAPTAIN_FORGE_MODEL,
    messages: messages as any,
    max_completion_tokens: CAPTAIN_MAX_OUTPUT_TOKENS,
    reasoning: getCaptainReasoning(CAPTAIN_FORGE_MODEL) as any,
  });
  const usage = result.usage;
  logApiCall({
    userId: 0, model: CAPTAIN_FORGE_MODEL, worker: "captain",
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
