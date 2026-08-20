import { Sandbox } from 'e2b'
import OpenAI from 'openai'
import { z } from 'zod'
import { CAPTAIN_Q_SYSTEM_PROMPT } from './captainQPrompt'

// ─── Config ─────────────────────────────────────────────
const E2B_API_KEY = process.env.E2B_API_KEY!
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY!
const ORCHESTRATOR_MODEL = process.env.ORCHESTRATOR_MODEL || 'openai/gpt-4o'

const openrouter = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: OPENROUTER_KEY,
})

// ─── Tool Schemas (what the AI sees it can do) ──────────
const TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'run_python',
      description: 'Execute Python code in a secure sandbox. Use for math, data analysis, file processing, charts, or any computation. matplotlib, pandas, numpy are available.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Python code to execute' },
          timeout: { type: 'number', description: 'Max seconds (default 30)', default: 30 },
        },
        required: ['code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for current information. Use when you need facts, news, or data you do not already know.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_url',
      description: 'Read the contents of a specific URL. Use to extract text from a webpage.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Full URL to fetch' },
        },
        required: ['url'],
      },
    },
  },
]

// ─── Tool Implementations ───────────────────────────────

async function runPython(code: string, timeout = 30) {
  const sandbox = await Sandbox.create({ apiKey: E2B_API_KEY })
  try {
    const result = await sandbox.commands.run(`python3 -c ${JSON.stringify(code)}`, {
      timeoutMs: timeout * 1000,
    })

    return {
      success: result.exitCode === 0,
      output: result.stdout || '(no output)',
      errors: result.stderr || result.error || undefined,
    }
  } finally {
    await sandbox.kill() // always kill the sandbox
  }
}

async function webSearch(query: string) {
  // Tavily is the easiest here. Swap this for SerpAPI/DuckDuckGo if you prefer.
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      search_depth: 'basic',
      max_results: 5,
    }),
  })
  const data = await res.json()
  return {
    results: data.results?.map((r: any) => ({
      title: r.title,
      url: r.url,
      content: r.content,
    })) || [],
  }
}

async function fetchUrl(url: string) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; QuoratoriumBot/1.0)',
    },
  })
  // Basic text extraction — in production you might want a parser like cheerio
  const text = await res.text()
  return {
    url,
    content: text.slice(0, 8000), // truncate to keep token count sane
  }
}

// ─── The Orchestrator Loop ──────────────────────────────

export async function runAgent(prompt: string, conversationHistory: any[] = []) {
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: CAPTAIN_Q_SYSTEM_PROMPT + '\n\nUse the tools exposed in this request whenever they are appropriate. For real-time information, search before answering; for computation or data analysis, execute the available code tool.',
    },
    ...conversationHistory,
    { role: 'user', content: prompt },
  ]

  // Allow up to 5 tool calls before forcing a final answer
  for (let i = 0; i < 5; i++) {
    const completion = await openrouter.chat.completions.create({
      model: ORCHESTRATOR_MODEL,
      messages,
      tools: TOOLS,
      tool_choice: 'auto',
      temperature: 0.3,
    })

    const response = completion.choices[0].message

    // If no tool call, we're done
    if (!response.tool_calls || response.tool_calls.length === 0) {
      return {
        response: response.content,
        toolCallsUsed: i,
      }
    }

    // Add the AI's tool request to conversation
    messages.push(response)

    // Execute each requested tool
    for (const toolCall of response.tool_calls) {
      if (toolCall.type !== 'function') continue
      const { name, arguments: argsRaw } = toolCall.function
      const args = JSON.parse(argsRaw)
      let result: any

      console.log(`[TOOL] ${name}:`, args)

      try {
        if (name === 'run_python') {
          result = await runPython(args.code, args.timeout)
        } else if (name === 'web_search') {
          result = await webSearch(args.query)
        } else if (name === 'fetch_url') {
          result = await fetchUrl(args.url)
        } else {
          result = { error: `Unknown tool: ${name}` }
        }
      } catch (err: any) {
        result = { error: err.message }
      }

      // Feed result back to the AI
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      })
    }
  }

  // Safety fallback: force final answer if loop hits limit
  const final = await openrouter.chat.completions.create({
    model: ORCHESTRATOR_MODEL,
    messages,
    temperature: 0.3,
  })

  return {
    response: final.choices[0].message.content,
    toolCallsUsed: 5,
    note: 'Hit tool call limit',
  }
}

// ─── Express Route Handlers ─────────────────────────────

import type { Request, Response } from 'express'

export async function handleAgentChat(req: Request, res: Response) {
  const schema = z.object({
    message: z.string(),
    history: z.array(z.any()).optional(),
  })

  const { message, history } = schema.parse(req.body)

  try {
    const result = await runAgent(message, history)
    res.json({
      success: true,
      response: result.response,
      meta: {
        toolCallsUsed: result.toolCallsUsed,
        note: result.note,
      },
    })
  } catch (err: any) {
    console.error('[AGENT ERROR]', err)
    res.status(500).json({ success: false, error: err.message })
  }
}

// Standalone tool endpoint (useful for testing or direct calls)
export async function handleRunCode(req: Request, res: Response) {
  const schema = z.object({
    code: z.string(),
    timeout: z.number().optional(),
  })

  const { code, timeout } = schema.parse(req.body)
  const result = await runPython(code, timeout)
  res.json(result)
}
