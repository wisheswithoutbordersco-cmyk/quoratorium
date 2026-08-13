/**
 * AI Orchestration Router
 * 
 * Captain: Routes tasks to appropriate external workers
 * Builder: OpenAI GPT-4o (code generation)
 * Validator: Anthropic Claude (code review & validation)
 * Research: Perplexity Sonar (research & intelligence)
 * 
 * Each worker calls its respective external API directly.
 * Falls back to built-in Forge LLM if external keys are unavailable.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import type { Message } from "../_core/llm";
import {
  addConversationMessage,
  getConversationHistory,
  addOrchestrationEvent,
  createProject,
  updateProject,
  getProject,
  createGeneratedFile,
} from "../db";
import {
  callCaptain,
  callBuilder,
  callValidator,
  callResearch,
  callCaptainPlan,
  detectIntent,
  type WorkerIntent,
} from "../workers";
import { getGlobalMemoryContext } from "../supabaseMemoryService";

// ─── Router ─────────────────────────────────────────────────────────────────

export const aiRouter = router({
  /**
   * Main chat endpoint — Captain routes to appropriate worker based on intent
   */
  chat: protectedProcedure
    .input(z.object({
      message: z.string().min(1),
      projectId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      // Save user message
      // Conversation persistence handled by frontend ConversationPanel

      // Detect intent to route to appropriate worker
      const intent = detectIntent(input.message);

      // Get conversation history for context
      const history = await getConversationHistory(userId, input.projectId, 20);
      const messages: Message[] = history.map(msg => ({
        role: msg.role as "user" | "assistant" | "system",
        content: msg.content,
      }));

      // Inject Supabase global memory context (cross-project user preferences)
      try {
        const globalMemory = await getGlobalMemoryContext(String(userId));
        if (globalMemory) {
          messages.unshift({ role: "system", content: `User context from persistent memory:\n${globalMemory}` });
        }
      } catch {
        // Non-blocking: proceed without global memory
      }

      // Ensure current message is included
      if (messages.length === 0 || messages[messages.length - 1].content !== input.message) {
        messages.push({ role: "user", content: input.message });
      }

      let response: string;
      let workerUsed: string;

      switch (intent) {
        case "research": {
          // Route to Perplexity Sonar
          workerUsed = "Research (Perplexity Sonar)";
      await addOrchestrationEvent({
        user_id: userId,
        project_id: input.projectId ?? null,
        event_type: "research_start",
        agent_name: "Research Worker",
        summary: `Researching: ${input.message.slice(0, 100)}`,
      });

          response = await callResearch(input.message);

          await addOrchestrationEvent({
            user_id: userId,
            project_id: input.projectId ?? null,
            event_type: "research_complete",
            agent_name: "Research Worker",
            summary: response.slice(0, 200),
          });
          break;
        }

        case "build": {
          // For build requests in chat, Captain provides the plan
          // Actual code generation happens via the build endpoint
          workerUsed = "Captain Q (OpenAI GPT-4o)";
          response = await callCaptain(messages);
          break;
        }

        case "validate": {
          // Route to Anthropic Claude for validation
          workerUsed = "Validator (Anthropic Claude)";
          await addOrchestrationEvent({
            user_id: userId,
            project_id: input.projectId ?? null,
            event_type: "validator_start",
            agent_name: "Validator",
            summary: `Validating: ${input.message.slice(0, 100)}`,
          });

          response = await callValidator(input.message, "User-requested validation");

          await addOrchestrationEvent({
            user_id: userId,
            project_id: input.projectId ?? null,
            event_type: "validator_complete",
            agent_name: "Validator",
            summary: response.slice(0, 200),
          });
          break;
        }

        case "image_gen": {
          // Generate image via Captain Q API endpoint
          workerUsed = "Image Generator (fal.ai/DALL-E)";
          try {
            const imgRes = await fetch(`http://localhost:${process.env.PORT || 3000}/api/generate-image`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt: input.message, provider: 'fal' }),
            });
            const imgData = await imgRes.json() as any;
            if (imgData.success && imgData.imageUrl) {
              response = `Here's your generated image:\n\n![Generated Image](${imgData.imageUrl})\n\nPrompt used: ${imgData.prompt}`;
            } else {
              response = `Image generation failed: ${imgData.error || 'Unknown error'}. Make sure FAL_API_KEY is configured.`;
            }
          } catch (e: any) {
            response = `Image generation error: ${e.message}`;
          }
          break;
        }

        case "social": {
          // Queue a social media post
          workerUsed = "Social Media (Instagram/Facebook)";
          try {
            const postRes = await fetch(`http://localhost:${process.env.PORT || 3000}/api/social/queue`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ platform: 'instagram', caption: input.message, hashtags: '' }),
            });
            const postData = await postRes.json() as any;
            if (postData.success) {
              response = `Post queued for Instagram! ID: ${postData.queued?.id}. It will be posted when Make.com picks it up from the queue.`;
            } else {
              response = `Failed to queue post: ${postData.error || 'Supabase not configured'}`;
            }
          } catch (e: any) {
            response = `Social posting error: ${e.message}`;
          }
          break;
        }

        default: {
          // General chat — Captain handles directly
          workerUsed = "Captain Q (OpenAI GPT-4o)";
          response = await callCaptain(messages);
          break;
        }
      }

      // Save assistant response
      // Conversation persistence handled by frontend ConversationPanel

      // Log orchestration event
      await addOrchestrationEvent({
        user_id: userId,
        project_id: input.projectId ?? null,
        event_type: "captain_response",
        agent_name: workerUsed,
        summary: response.slice(0, 200),
      });

      return {
        content: response,
        role: "assistant" as const,
        timestamp: Date.now(),
        workerUsed,
        intent,
      };
    }),

  /**
   * Build endpoint — triggers the full multi-worker orchestration pipeline
   * Captain plans → Builder generates (OpenAI) → Validator reviews (Anthropic)
   */
  build: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      task: z.string().min(1),
      context: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const project = await getProject(input.projectId, userId);
      if (!project) throw new Error("Project not found");

      // Phase 1: Captain analyzes and creates plan (OpenAI GPT-4o)
      await addOrchestrationEvent({
        user_id: userId,
        project_id: input.projectId,
        event_type: "phase_start",
        agent_name: "Captain Q",
        summary: `Planning: ${input.task.slice(0, 100)}`,
      });

      const plan = await callCaptainPlan(input.task, project.description || "");

      // Update project phases
      await updateProject(input.projectId, userId, {
        phases: plan.phases as any,
        total_phases: plan.phases.length,
        current_phase: 1,
      });

      await addOrchestrationEvent({
        user_id: userId,
        project_id: input.projectId,
        event_type: "plan_created",
        agent_name: "Captain Q",
        summary: plan.summary,
        payload: plan as any,
      });

      // Phase 2: Builder generates code (OpenAI GPT-4o)
      await addOrchestrationEvent({
        user_id: userId,
        project_id: input.projectId,
        event_type: "builder_start",
        agent_name: "Builder (OpenAI GPT-4o)",
        summary: `Generating code: ${input.task.slice(0, 100)}`,
      });

      const builderOutput = await callBuilder(input.task, input.context || project.description || "");

      await addOrchestrationEvent({
        user_id: userId,
        project_id: input.projectId,
        event_type: "builder_complete",
        agent_name: "Builder (OpenAI GPT-4o)",
        summary: "Code generation complete",
      });

      // Save generated files
      const files = extractFilesFromMarkdown(builderOutput);
      for (const file of files) {
        await createGeneratedFile({
          project_id: input.projectId,
          user_id: userId,
          filename: file.filename,
          filepath: file.filepath,
          content: file.content,
          language: file.language,
        });
      }

      await updateProject(input.projectId, userId, { current_phase: 2 });

      // Phase 3: Validator reviews (Anthropic Claude)
      await addOrchestrationEvent({
        user_id: userId,
        project_id: input.projectId,
        event_type: "validator_start",
        agent_name: "Validator (Anthropic Claude)",
        summary: "Reviewing generated output for quality",
      });

      const validationResult = await callValidator(builderOutput, input.task);

      await addOrchestrationEvent({
        user_id: userId,
        project_id: input.projectId,
        event_type: "validator_complete",
        agent_name: "Validator (Anthropic Claude)",
        summary: validationResult.slice(0, 200),
      });

      // Update project status
      await updateProject(input.projectId, userId, {
        current_phase: plan.phases.length,
        status: "completed",
      });

      await addOrchestrationEvent({
        user_id: userId,
        project_id: input.projectId,
        event_type: "pipeline_complete",
        agent_name: "Captain Q",
        summary: `Build pipeline completed — ${files.length} files generated`,
      });

      // Save full response as conversation
      // Conversation persistence handled by frontend ConversationPanel

      return {
        plan,
        filesGenerated: files.length,
        validation: validationResult,
        builderOutput,
        workersUsed: {
          captain: "OpenAI GPT-4o",
          builder: "OpenAI GPT-4o",
          validator: "Anthropic Claude",
        },
      };
    }),

  /**
   * Research endpoint — direct call to Perplexity Sonar
   */
  research: protectedProcedure
    .input(z.object({
      query: z.string().min(1),
      projectId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      await addOrchestrationEvent({
        user_id: userId,
        project_id: input.projectId ?? null,
        event_type: "research_start",
        agent_name: "Research (Perplexity Sonar)",
        summary: `Researching: ${input.query.slice(0, 100)}`,
      });

      const result = await callResearch(input.query);

      await addOrchestrationEvent({
        user_id: userId,
        project_id: input.projectId ?? null,
        event_type: "research_complete",
        agent_name: "Research (Perplexity Sonar)",
        summary: result.slice(0, 200),
      });

      // Save to conversation
      // Conversation persistence handled by frontend ConversationPanel

      return {
        content: result,
        workerUsed: "Perplexity Sonar",
        timestamp: Date.now(),
      };
    }),

  /**
   * Get conversation history
   */
  getHistory: protectedProcedure
    .input(z.object({
      projectId: z.number().optional(),
      limit: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      return getConversationHistory(ctx.user.id, input.projectId, input.limit || 50);
    }),

  /**
   * Get orchestration events for a project
   */
  getOrchestrationEvents: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      limit: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { getProjectOrchestrationEvents } = await import("../db");
      return getProjectOrchestrationEvents(input.projectId, ctx.user.id, input.limit || 30);
    }),

  /**
   * Health check — verify which external APIs are available
   */
  status: protectedProcedure.query(async () => {
    return {
      captain: { provider: "OpenAI GPT-4o", available: !!process.env.OPENAI_API_KEY },
      builder: { provider: "OpenAI GPT-4o", available: !!process.env.OPENAI_API_KEY },
      validator: { provider: "Anthropic Claude", available: !!process.env.ANTHROPIC_API_KEY },
      research: { provider: "Perplexity Sonar", available: !!process.env.SONAR_API_KEY },
      fallback: { provider: "Forge LLM (Gemini 2.5 Flash)", available: true },
    };
  }),
});

// ─── Utilities ──────────────────────────────────────────────────────────────

function extractFilesFromMarkdown(markdown: string): Array<{
  filename: string;
  filepath: string;
  content: string;
  language: string;
}> {
  const files: Array<{ filename: string; filepath: string; content: string; language: string }> = [];
  // Match code blocks with language and optional file path comment
  const codeBlockRegex = /```(\w+)(?:\s*\/\/\s*(.+?)\s*)?[\r\n]([\s\S]*?)```/g;
  let match;

  while ((match = codeBlockRegex.exec(markdown)) !== null) {
    const language = match[1];
    const filepath = match[2] || `generated.${getExtension(language)}`;
    const content = match[3].trim();
    const filename = filepath.split("/").pop() || filepath;

    files.push({ filename, filepath, content, language });
  }

  return files;
}

function getExtension(language: string): string {
  const map: Record<string, string> = {
    typescript: "ts", tsx: "tsx", javascript: "js", jsx: "jsx",
    html: "html", css: "css", json: "json", python: "py",
    markdown: "md", yaml: "yml", sql: "sql", bash: "sh",
  };
  return map[language] || language;
}

// Re-export sprites status for the orchestration panel
export { getExecutionEngineStatus } from "../codeExecutor";
