/**
 * AI Orchestration Router
 *
 * Captain routes work and Builder/Validator honor each user's validated model
 * preferences. Research uses Perplexity when configured and the built-in proxy
 * otherwise.
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
  callBuilder,
  callValidator,
  callResearch,
  callCaptainPlan,
} from "../workers";
import { getGlobalMemoryContext } from "../supabaseMemoryService";
import { runToolLoop } from "../tools/index";
import { CAPTAIN_OPENROUTER_MODEL } from "../assistantConfig";
import { getUserSettings } from "./settings";
import { canAffordRequest, calculateCost } from "../costService";

// ─── Router ─────────────────────────────────────────────────────────────────

export const aiRouter = router({
  /**
   * Main chat endpoint — Captain routes to appropriate worker based on intent
   */
  chat: protectedProcedure
    .input(
      z.object({
        message: z.string().min(1),
        projectId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      // Save user message
      // Conversation persistence handled by frontend ConversationPanel

      const intent = "chat" as const;

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
          messages.unshift({
            role: "system",
            content: `User context from persistent memory:\n${globalMemory}`,
          });
        }
      } catch {
        // Non-blocking: proceed without global memory
      }

      // Ensure current message is included
      if (
        messages.length === 0 ||
        messages[messages.length - 1].content !== input.message
      ) {
        messages.push({ role: "user", content: input.message });
      }

      const assistantResult = await runToolLoop(
        messages,
        { userId: String(userId), projectId: input.projectId || null },
        CAPTAIN_OPENROUTER_MODEL
      );
      const response =
        assistantResult.response?.trim() ||
        "I couldn't produce a useful response. Please try that again.";
      const workerUsed =
        assistantResult.toolsUsed.length > 0
          ? `Toríu · ${assistantResult.toolsUsed.join(", ")}`
          : "Toríu";

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
        artifacts: assistantResult.artifacts,
      };
    }),

  /**
   * Build endpoint — triggers the full multi-worker orchestration pipeline
   * Captain plans → Builder generates (OpenAI) → Validator reviews (Anthropic)
   */
  build: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        task: z.string().min(1),
        context: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const project = await getProject(input.projectId, userId);
      if (!project) throw new Error("Project not found");
      const settings = await getUserSettings(userId);
      const temperature = Number(settings["ai.temperature"]);
      const maxTokens = Number(settings["ai.maxTokens"]);
      const builderModel = settings["ai.defaultBuilderModel"];
      const validatorModel = settings["ai.defaultValidatorModel"];
      const preferences = {
        temperature: Number.isFinite(temperature) ? temperature : 0.7,
        maxTokens: Number.isInteger(maxTokens) ? maxTokens : 4096,
      };
      const estimatedCost =
        calculateCost(builderModel, 2_000, preferences.maxTokens) +
        calculateCost(validatorModel, 2_000, preferences.maxTokens);
      const affordability = await canAffordRequest(userId, estimatedCost);
      if (!affordability.allowed) {
        throw new Error(`Budget limit reached: ${affordability.reason}`);
      }

      // Phase 1: Captain analyzes and creates plan (OpenAI GPT-4o)
      await addOrchestrationEvent({
        user_id: userId,
        project_id: input.projectId,
        event_type: "phase_start",
        agent_name: "Toríu",
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
        agent_name: "Toríu",
        summary: plan.summary,
        payload: plan as any,
      });

      // Phase 2: Builder generates code (OpenAI GPT-4o)
      await addOrchestrationEvent({
        user_id: userId,
        project_id: input.projectId,
        event_type: "builder_start",
        agent_name: `Builder (${builderModel})`,
        summary: `Generating code: ${input.task.slice(0, 100)}`,
      });

      const builderOutput = await callBuilder(
        input.task,
        input.context || project.description || "",
        userId,
        input.projectId,
        { ...preferences, model: builderModel }
      );

      await addOrchestrationEvent({
        user_id: userId,
        project_id: input.projectId,
        event_type: "builder_complete",
        agent_name: `Builder (${builderModel})`,
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
        agent_name: `Validator (${validatorModel})`,
        summary: "Reviewing generated output for quality",
      });

      const validationResult = await callValidator(
        builderOutput,
        input.task,
        userId,
        input.projectId,
        { ...preferences, model: validatorModel }
      );

      await addOrchestrationEvent({
        user_id: userId,
        project_id: input.projectId,
        event_type: "validator_complete",
        agent_name: `Validator (${validatorModel})`,
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
        agent_name: "Toríu",
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
          captain: CAPTAIN_OPENROUTER_MODEL,
          builder: builderModel,
          validator: validatorModel,
        },
      };
    }),

  /**
   * Research endpoint — direct call to Perplexity Sonar
   */
  research: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1),
        projectId: z.number().optional(),
      })
    )
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
    .input(
      z.object({
        projectId: z.number().optional(),
        limit: z.number().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return getConversationHistory(
        ctx.user.id,
        input.projectId,
        input.limit || 50
      );
    }),

  /**
   * Get orchestration events for a project
   */
  getOrchestrationEvents: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        limit: z.number().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { getProjectOrchestrationEvents } = await import("../db");
      return getProjectOrchestrationEvents(
        input.projectId,
        ctx.user.id,
        input.limit || 30
      );
    }),

  /**
   * Health check — verify which external APIs are available
   */
  status: protectedProcedure.query(async ({ ctx }) => {
    const settings = await getUserSettings(ctx.user.id);
    const forgeAvailable = Boolean(
      process.env.BUILT_IN_FORGE_API_URL && process.env.BUILT_IN_FORGE_API_KEY
    );
    const openAiAvailable = Boolean(process.env.OPENAI_API_KEY);
    const researchAvailable =
      Boolean(process.env.SONAR_API_KEY) || forgeAvailable;
    return {
      captain: {
        provider: openAiAvailable ? "OpenAI" : "Manus built-in LLM",
        available: openAiAvailable || forgeAvailable,
      },
      builder: {
        provider: settings["ai.defaultBuilderModel"],
        available: forgeAvailable,
      },
      validator: {
        provider: settings["ai.defaultValidatorModel"],
        available: forgeAvailable,
      },
      research: {
        provider: process.env.SONAR_API_KEY
          ? "Perplexity Sonar"
          : "Manus built-in LLM",
        available: researchAvailable,
      },
      fallback: { provider: "Manus built-in LLM", available: forgeAvailable },
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
  const files: Array<{
    filename: string;
    filepath: string;
    content: string;
    language: string;
  }> = [];
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
    typescript: "ts",
    tsx: "tsx",
    javascript: "js",
    jsx: "jsx",
    html: "html",
    css: "css",
    json: "json",
    python: "py",
    markdown: "md",
    yaml: "yml",
    sql: "sql",
    bash: "sh",
  };
  return map[language] || language;
}

// Re-export sprites status for the orchestration panel
export { getExecutionEngineStatus } from "../codeExecutor";
