/**
 * Captain Q — Autonomous Tool-Use Framework
 * 
 * Provides a registry of tools that Captain Q can autonomously invoke
 * via OpenAI-style function calling. The orchestrator handles:
 * - Tool registration with typed schemas
 * - Execution of tool calls returned by the LLM
 * - Multi-step loops (call tool → get result → decide next action)
 * - Streaming status events back to the client
 */
import OpenAI from "openai";
import type { Tool, ToolCall, Message } from "../_core/llm";
import { CAPTAIN_Q_SYSTEM_PROMPT, CAPTAIN_Q_TOOL_GUIDANCE } from "../captainQPrompt";
import { invokeLLM } from "../_core/llm";
import {
  CAPTAIN_FORGE_MODEL,
  CAPTAIN_MAX_OUTPUT_TOKENS,
  CAPTAIN_OPENAI_MODEL,
  CAPTAIN_OPENROUTER_MODEL,
  isGpt5Family,
  getCaptainReasoning,
} from "../assistantConfig";
import type { Response } from "express";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
  execute: (args: Record<string, any>, context: ToolContext) => Promise<ToolResult>;
}

export interface ToolContext {
  userId: string;
  projectId?: number | null;
  conversationId?: number | null;
  durableAttachmentIds?: string[];
  res?: Response; // For streaming status updates
}

export interface ToolResult {
  success: boolean;
  output: string;
  data?: Record<string, any>; // Structured data for further processing
  artifacts?: ToolArtifact[]; // Files, URLs, etc. produced
}

export interface ToolArtifact {
  type: "file" | "url" | "code" | "image";
  name: string;
  content?: string;
  url?: string;
  language?: string;
}

// ─── Tool Registry ──────────────────────────────────────────────────────────

const toolRegistry: Map<string, ToolDefinition> = new Map();

export function registerTool(tool: ToolDefinition): void {
  toolRegistry.set(tool.name, tool);
}

export function getRegisteredTools(): Tool[] {
  return Array.from(toolRegistry.values()).map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export function getTool(name: string): ToolDefinition | undefined {
  return toolRegistry.get(name);
}

// ─── Tool Execution Loop ────────────────────────────────────────────────────

const MAX_TOOL_ITERATIONS = 6; // Safety limit to prevent infinite loops

/**
 * Run Captain Q's autonomous tool-use loop:
 * 1. Send messages + tools to LLM
 * 2. If LLM returns tool_calls, execute them
 * 3. Feed results back and repeat until LLM responds with text
 * 4. Stream the final text response to the client
 */
export async function runToolLoop(
  messages: Message[],
  context: ToolContext,
  model: string = CAPTAIN_OPENROUTER_MODEL,
  onToken?: (token: string) => void,
  onToolStart?: (toolName: string, args: Record<string, any>) => void,
  onToolResult?: (toolName: string, result: ToolResult) => void,
): Promise<{ response: string; toolsUsed: string[]; artifacts: ToolArtifact[] }> {
  // Lazy-load tool modules to avoid circular dependency issues with esbuild bundling
  if (toolRegistry.size === 0) {
    try {
      await import("./fileCreate");
      await import("./codeExecute");
      await import("./webResearch");
      await import("./scriptorium");
      await import("./deploy");
      await import("./generateImage");
      await import("./proposeShopifyDraft");
    } catch (regErr: any) {
      console.warn("[ToolLoop] Tool registration failed:", regErr?.message);
    }
  }

  const tools = getRegisteredTools();
  const toolsUsed: string[] = [];
  const allArtifacts: ToolArtifact[] = [];
  let iteration = 0;

  // Clone messages to avoid mutating the original
  const conversationMessages = [...messages];

  // Preserve the caller's full Captain Q context and append one concise tool
  // contract. The previous implementation prepended a second, conflicting copy
  // of the assistant prompt and pushed the model toward unnecessary actions.
  if (conversationMessages[0]?.role === "system") {
    const existingContent = conversationMessages[0].content;
    const systemText = typeof existingContent === "string"
      ? existingContent
      : Array.isArray(existingContent)
        ? existingContent.map((part: any) => part.type === "text" ? part.text : "").join("\n")
        : existingContent.type === "text"
          ? existingContent.text
          : "";
    conversationMessages[0] = {
      ...conversationMessages[0],
      content: `${systemText}\n\n${CAPTAIN_Q_TOOL_GUIDANCE}`,
    };
  } else {
    conversationMessages.unshift({
      role: "system",
      content: `${CAPTAIN_Q_SYSTEM_PROMPT}\n\n${CAPTAIN_Q_TOOL_GUIDANCE}`,
    });
  }

  while (iteration < MAX_TOOL_ITERATIONS) {
    iteration++;

    const openrouterKey = process.env.OPENROUTER_API_KEY;
    const toolModel = model || CAPTAIN_OPENROUTER_MODEL;
    const providerErrors: string[] = [];
    let result: any;

    // OpenRouter is the preferred provider, but model availability can vary by
    // account or deployment. Retry known multimodal tool-capable models before
    // moving to a different provider.
    if (openrouterKey) {
      const candidates = Array.from(new Set([toolModel, "openai/gpt-5", "openai/gpt-4o"]));
      for (const candidate of candidates) {
        try {
          const reasoning = getCaptainReasoning(candidate);
          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${openrouterKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://quoratorium.com",
              "X-Title": "Captain Q Tools",
            },
            body: JSON.stringify({
              model: candidate,
              messages: conversationMessages,
              tools: tools.length > 0 ? tools : undefined,
              tool_choice: tools.length > 0 ? "auto" : undefined,
              ...(isGpt5Family(candidate)
                ? { max_completion_tokens: CAPTAIN_MAX_OUTPUT_TOKENS }
                : { max_tokens: CAPTAIN_MAX_OUTPUT_TOKENS }),
              ...(reasoning ? { reasoning } : {}),
            }),
          });
          if (!response.ok) {
            const detail = (await response.text()).slice(0, 300);
            providerErrors.push(`OpenRouter ${candidate}: ${response.status} ${detail}`);
            continue;
          }
          result = await response.json();
          break;
        } catch (error: any) {
          providerErrors.push(`OpenRouter ${candidate}: ${error?.message || "request failed"}`);
        }
      }
    }

    // A separate OpenAI call keeps Captain Q available even when OpenRouter is
    // configured but rejects a new model or has a temporary outage.
    if (!result && process.env.OPENAI_API_KEY) {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      for (const candidate of Array.from(new Set([CAPTAIN_OPENAI_MODEL, "gpt-4o"]))) {
        try {
          result = await openai.chat.completions.create({
            model: candidate,
            messages: conversationMessages as any,
            tools: tools.length > 0 ? tools as any : undefined,
            tool_choice: tools.length > 0 ? "auto" : undefined,
            ...(isGpt5Family(candidate)
              ? { max_completion_tokens: CAPTAIN_MAX_OUTPUT_TOKENS, reasoning_effort: "low" }
              : { max_tokens: CAPTAIN_MAX_OUTPUT_TOKENS }),
          } as any);
          break;
        } catch (error: any) {
          providerErrors.push(`OpenAI ${candidate}: ${error?.message || "request failed"}`);
        }
      }
    }

    // Forge remains the final model provider so transient external-provider
    // failures do not become a generic user-facing chat error.
    if (!result) {
      try {
        result = await invokeLLM({
          model: CAPTAIN_FORGE_MODEL,
          messages: conversationMessages,
          tools: tools.length > 0 ? tools : undefined,
          toolChoice: tools.length > 0 ? "auto" : undefined,
          max_completion_tokens: CAPTAIN_MAX_OUTPUT_TOKENS,
          reasoning: getCaptainReasoning(CAPTAIN_FORGE_MODEL) as any,
        });
      } catch (error: any) {
        providerErrors.push(`Forge ${CAPTAIN_FORGE_MODEL}: ${error?.message || "request failed"}`);
        throw new Error(`All Captain Q providers failed: ${providerErrors.join(" | ")}`);
      }
    }

    const choice = result?.choices?.[0];
    if (!choice) {
      return { response: "I encountered an issue processing your request.", toolsUsed, artifacts: allArtifacts };
    }

    const assistantMessage = choice.message;
    const toolCalls = assistantMessage.tool_calls;

    // If no tool calls, we have the final text response
    if (!toolCalls || toolCalls.length === 0) {
      const content = typeof assistantMessage.content === "string"
        ? assistantMessage.content
        : Array.isArray(assistantMessage.content)
          ? assistantMessage.content.map((c: any) => c.type === "text" ? c.text : "").join("")
          : "";
      return { response: content, toolsUsed, artifacts: allArtifacts };
    }

    // Add assistant message with tool_calls to conversation
    conversationMessages.push({
      role: "assistant",
      content: assistantMessage.content || "",
      tool_calls: toolCalls,
    } as any);

    // Execute each tool call
    for (const toolCall of toolCalls) {
      const toolName = toolCall.function.name;
      const toolDef = getTool(toolName);

      let toolResult: ToolResult;

      if (!toolDef) {
        toolResult = { success: false, output: `Unknown tool: ${toolName}` };
      } else {
        let args: Record<string, any> = {};
        try {
          args = JSON.parse(toolCall.function.arguments || "{}");
        } catch {
          args = {};
        }

        // Notify about tool start
        onToolStart?.(toolName, args);

        try {
          toolResult = await toolDef.execute(args, context);
          if (!toolsUsed.includes(toolName)) toolsUsed.push(toolName);
          if (toolResult.artifacts) {
            allArtifacts.push(...toolResult.artifacts);
          }
        } catch (err: any) {
          toolResult = { success: false, output: `Tool execution failed: ${err?.message || "Unknown error"}` };
        }

        // Notify about tool result
        onToolResult?.(toolName, toolResult);
      }

      // Add tool result to conversation
      conversationMessages.push({
        role: "tool",
        content: toolResult.output,
        tool_call_id: toolCall.id,
      } as any);
    }
  }

  // If we hit the iteration limit, return what we have
  return {
    response: "I completed several steps but reached my iteration limit. Here's what I accomplished so far.",
    toolsUsed,
    artifacts: allArtifacts,
  };
}
