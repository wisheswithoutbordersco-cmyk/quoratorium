/**
 * Tool: web_research
 * Search the web for information using Perplexity/Sonar or OpenRouter
 */
import { registerTool, type ToolContext, type ToolResult } from "./index";
import { invokeLLM } from "../_core/llm";

registerTool({
  name: "web_research",
  description: "Search the web for current information, facts, documentation, or any topic. Use this when the user asks about current events, needs factual information, or when you need to look something up to give an accurate answer.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query or question to research",
      },
      context: {
        type: "string",
        description: "Optional context about why this research is needed",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  async execute(args: Record<string, any>, _context: ToolContext): Promise<ToolResult> {
    const { query, context: researchContext } = args;

    if (!query) {
      return { success: false, output: "Missing search query" };
    }

    try {
      // Use Perplexity Sonar if available, otherwise use Forge LLM with research prompt
      if (process.env.SONAR_API_KEY) {
        const response = await fetchPerplexity(query);
        return {
          success: true,
          output: response,
          data: { source: "perplexity", query },
        };
      }

      // Fallback: use LLM with research-focused prompt
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "You are a research assistant. Provide accurate, up-to-date information based on your knowledge. Be concise and factual. If you're not sure about something, say so.",
          },
          {
            role: "user",
            content: researchContext
              ? `Research context: ${researchContext}\n\nQuery: ${query}`
              : query,
          },
        ],
      });

      const content = response?.choices?.[0]?.message?.content;
      const text = typeof content === "string" ? content : JSON.stringify(content || "No results");

      return {
        success: true,
        output: text,
        data: { source: "llm_fallback", query },
      };
    } catch (err: any) {
      return { success: false, output: `Research failed: ${err?.message || "Unknown error"}` };
    }
  },
});

async function fetchPerplexity(query: string): Promise<string> {
  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.SONAR_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar",
      messages: [
        { role: "system", content: "Be precise and concise. Cite sources when possible." },
        { role: "user", content: query },
      ],
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    throw new Error(`Perplexity API error: ${response.status}`);
  }

  const data = await response.json() as any;
  return data?.choices?.[0]?.message?.content || "No results found.";
}
