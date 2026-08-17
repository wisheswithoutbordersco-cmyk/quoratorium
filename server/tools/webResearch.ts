/**
 * Tool: web_research
 * Search the web for current information using Tavily API
 * Falls back to Perplexity Sonar if available, then LLM
 */
import { registerTool, type ToolContext, type ToolResult } from "./index";
import { invokeLLM } from "../_core/llm";

registerTool({
  name: "web_research",
  description: "Search the web for current information, facts, news, sports scores, weather, prices, or any topic that requires up-to-date data. ALWAYS use this tool when the user asks about current events, schedules, scores, weather, or anything that changes over time. Do NOT guess — search first.",
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
      // Priority 1: Tavily (real-time web search with citations)
      if (process.env.TAVILY_API_KEY) {
        const response = await fetchTavily(query);
        return {
          success: true,
          output: response,
          data: { source: "tavily", query },
        };
      }
      // Priority 2: Perplexity Sonar
      if (process.env.SONAR_API_KEY) {
        const response = await fetchPerplexity(query);
        return {
          success: true,
          output: response,
          data: { source: "perplexity", query },
        };
      }
      // Priority 3: OpenRouter with Perplexity model
      if (process.env.OPENROUTER_API_KEY) {
        const response = await fetchOpenRouterPerplexity(query);
        return {
          success: true,
          output: response,
          data: { source: "openrouter_perplexity", query },
        };
      }
      // Fallback: use built-in LLM (will use training data, not live web)
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "You are a research assistant. Provide accurate information based on your knowledge. Be concise and factual. If you're not sure about something or if the information might be outdated, clearly state that.",
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
        output: `[Note: This answer is from training data, not a live web search. It may be outdated.]\n\n${text}`,
        data: { source: "llm_fallback", query },
      };
    } catch (err: any) {
      return { success: false, output: `Research failed: ${err?.message || "Unknown error"}` };
    }
  },
});

// ─── Tavily Search ─────────────────────────────────────
async function fetchTavily(query: string): Promise<string> {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      search_depth: "basic",
      max_results: 5,
      include_answer: true,
    }),
  });
  if (!response.ok) {
    throw new Error(`Tavily API error: ${response.status}`);
  }
  const data = await response.json() as any;

  // Build a comprehensive response
  let output = "";

  // Tavily provides a direct answer
  if (data.answer) {
    output += `**Answer:** ${data.answer}\n\n`;
  }

  // Include source results
  if (data.results && data.results.length > 0) {
    output += "**Sources:**\n";
    for (const result of data.results.slice(0, 5)) {
      output += `- [${result.title}](${result.url}): ${result.content?.slice(0, 200) || ""}\n`;
    }
  }

  return output || "No results found.";
}

// ─── Perplexity Direct ─────────────────────────────────
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

// ─── OpenRouter with Perplexity model ──────────────────
async function fetchOpenRouterPerplexity(query: string): Promise<string> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://quoratorium.com",
      "X-Title": "Captain Q Research",
    },
    body: JSON.stringify({
      model: "perplexity/sonar-pro",
      messages: [
        { role: "system", content: "Be precise, concise, and cite sources. Provide current, up-to-date information." },
        { role: "user", content: query },
      ],
      max_tokens: 1000,
    }),
  });
  if (!response.ok) {
    throw new Error(`OpenRouter/Perplexity error: ${response.status}`);
  }
  const data = await response.json() as any;
  return data?.choices?.[0]?.message?.content || "No results found.";
}
