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
import type { Tool, ToolCall, Message } from "../_core/llm";
import { CAPTAIN_Q_SYSTEM_PROMPT } from "../captainQPrompt";
import { invokeLLM } from "../_core/llm";
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

const MAX_TOOL_ITERATIONS = 8; // Safety limit to prevent infinite loops

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
  model: string = "deepseek/deepseek-chat",
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

  // Ensure the tool-calling model knows it MUST use tools for real-time info
  const toolSystemMessage = {
    role: "system" as const,
    content:
      CAPTAIN_Q_SYSTEM_PROMPT +
      "\n\nTOOL USE REQUIREMENTS:\n" +
      "- For current events, weather, news, sports scores, stock prices, or anything that can change over time: always call web_search first.\n" +
      "- For math calculations, data analysis, or code execution: always call run_code.\n" +
      "- If information might be current, search first; never claim real-time information is unavailable when web_search is available.\n" +
      "- For ANY visual request (poster, flyer, business card, wall art, menu, brochure, landing page design, social media graphic, banner, or logo concept): use scriptorium_generate FIRST. If it fails or times out, immediately call generate_image with the same prompt.\n" +
      "- Do NOT use create_file to make an HTML page for a visual request. Only use create_file + deploy_project when the user specifically asks for a working interactive website or web application with functionality.\n" +
      "- Treat a request to build a landing page as a request for a designed image unless the user explicitly requests a functioning website.\n" +
      "- Never say image generation is unavailable when either image tool can be used, and never dump raw code, HTML, CSS, or JavaScript into the chat for a visual request.",
  };

  // Prepend tool instructions (replace any existing system message or add before user messages)
  if (conversationMessages[0]?.role === "system") {
    conversationMessages[0] = { ...conversationMessages[0], content: toolSystemMessage.content + "\n\n" + (conversationMessages[0] as any).content };
  } else {
    conversationMessages.unshift(toolSystemMessage as any);
  }

  while (iteration < MAX_TOOL_ITERATIONS) {
    iteration++;

    // Use OpenRouter directly for tool calling (invokeLLM uses Gemini which doesn't reliably call tools)
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    const toolModel = model || process.env.ORCHESTRATOR_MODEL || "openai/gpt-4o";

    let result: any;
    if (openrouterKey) {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openrouterKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://quoratorium.com",
          "X-Title": "Captain Q Tools",
        },
        body: JSON.stringify({
          model: toolModel,
          messages: conversationMessages,
          tools: tools.length > 0 ? tools : undefined,
          tool_choice: tools.length > 0 ? "auto" : undefined,
        }),
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenRouter tool call failed (${response.status}): ${errText}`);
      }
      result = await response.json();
    } else {
      // Fallback to built-in LLM if no OpenRouter key
      result = await invokeLLM({
        messages: conversationMessages,
        tools: tools.length > 0 ? tools : undefined,
        toolChoice: tools.length > 0 ? "auto" : undefined,
      });
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
          toolsUsed.push(toolName);
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
