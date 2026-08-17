/**
 * CAPTAIN Q — Multi-Model Intelligence Router
 * 
 * Automatically picks the best AI model for each task type.
 * All models accessed through OpenRouter with one key.
 * 
 * Models available:
 *   - GPT-4o: Fast, good all-rounder, best for code and quick tasks
 *   - Claude Sonnet 4: Best for writing, analysis, and nuanced reasoning
 *   - Claude Opus 4: Deepest thinking, complex multi-step problems
 *   - Perplexity Sonar: Real-time web knowledge, citations
 *   - DeepSeek R1: Cheapest reasoning model, good for math/logic
 *   - GPT-4o-mini: Ultra-fast for simple tasks, cheapest OpenAI
 */

import OpenAI from 'openai';

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY!;

const openrouter = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: OPENROUTER_KEY,
  defaultHeaders: {
    'HTTP-Referer': 'https://quoratorium.com',
    'X-Title': 'Captain Q',
  },
});

// ─── Model Definitions ─────────────────────────────────
export const MODELS = {
  // Fast all-rounder — code, quick answers, tool use
  GPT4O: 'openai/gpt-4o',
  // Best writer — long-form content, descriptions, creative
  CLAUDE_SONNET: 'anthropic/claude-sonnet-4-20250514',
  // Deepest thinker — complex analysis, multi-step reasoning
  CLAUDE_OPUS: 'anthropic/claude-opus-4-20250514',
  // Real-time web knowledge — current events, research, citations
  PERPLEXITY: 'perplexity/sonar-pro',
  // Cheap reasoning — math, logic, step-by-step
  DEEPSEEK: 'deepseek/deepseek-r1',
  // Ultra-fast simple tasks — formatting, classification, quick edits
  FAST: 'openai/gpt-4o-mini',
} as const;

// ─── Task Categories ───────────────────────────────────
type TaskCategory = 
  | 'code'           // Writing or fixing code
  | 'creative'       // Writing content, descriptions, stories
  | 'analysis'       // Breaking down complex problems
  | 'research'       // Finding current information
  | 'math'           // Calculations, logic puzzles
  | 'quick'          // Simple formatting, yes/no, classification
  | 'conversation'   // General chat, advice, brainstorming

// ─── Auto-Router: Picks the best model for the task ────
export function routeToModel(message: string, category?: TaskCategory): string {
  // If category is explicitly provided, use it
  if (category) {
    switch (category) {
      case 'code': return MODELS.GPT4O;
      case 'creative': return MODELS.CLAUDE_SONNET;
      case 'analysis': return MODELS.CLAUDE_OPUS;
      case 'research': return MODELS.PERPLEXITY;
      case 'math': return MODELS.DEEPSEEK;
      case 'quick': return MODELS.FAST;
      case 'conversation': return MODELS.GPT4O;
    }
  }

  // Auto-detect based on message content
  const lower = message.toLowerCase();

  // Code signals
  if (lower.includes('write code') || lower.includes('fix this code') || 
      lower.includes('function') || lower.includes('typescript') ||
      lower.includes('python') || lower.includes('javascript') ||
      lower.includes('debug') || lower.includes('api endpoint') ||
      lower.includes('build me') || lower.includes('create a script')) {
    return MODELS.GPT4O;
  }

  // Creative/writing signals
  if (lower.includes('write me') || lower.includes('description') ||
      lower.includes('caption') || lower.includes('story') ||
      lower.includes('rewrite') || lower.includes('blog post') ||
      lower.includes('product listing') || lower.includes('title and') ||
      lower.includes('social media') || lower.includes('instagram')) {
    return MODELS.CLAUDE_SONNET;
  }

  // Research signals
  if (lower.includes('what is') || lower.includes('search for') ||
      lower.includes('find out') || lower.includes('latest') ||
      lower.includes('current') || lower.includes('trending') ||
      lower.includes('news') || lower.includes('how much does') ||
      lower.includes('who is') || lower.includes('when did')) {
    return MODELS.PERPLEXITY;
  }

  // Math/logic signals
  if (lower.includes('calculate') || lower.includes('math') ||
      lower.includes('solve') || lower.includes('equation') ||
      lower.includes('percentage') || lower.includes('profit margin') ||
      lower.includes('how many') || lower.includes('cost analysis')) {
    return MODELS.DEEPSEEK;
  }

  // Deep analysis signals
  if (lower.includes('analyze') || lower.includes('compare') ||
      lower.includes('strategy') || lower.includes('breakdown') ||
      lower.includes('pros and cons') || lower.includes('business plan') ||
      lower.includes('audit') || lower.includes('review my')) {
    return MODELS.CLAUDE_OPUS;
  }

  // Quick/simple signals
  if (message.length < 20 || lower.includes('yes or no') ||
      lower.includes('format this') || lower.includes('list') ||
      lower.includes('translate')) {
    return MODELS.FAST;
  }

  // Default: GPT-4o (good all-rounder)
  return MODELS.GPT4O;
}

// ─── Call any model through OpenRouter ─────────────────
export async function callModel(
  model: string,
  messages: OpenAI.ChatCompletionMessageParam[],
  options?: {
    temperature?: number;
    maxTokens?: number;
    tools?: OpenAI.ChatCompletionTool[];
  }
): Promise<string> {
  const completion = await openrouter.chat.completions.create({
    model,
    messages,
    temperature: options?.temperature ?? 0.5,
    max_tokens: options?.maxTokens ?? 4096,
    tools: options?.tools,
    tool_choice: options?.tools ? 'auto' : undefined,
  });

  return completion.choices[0]?.message?.content || '';
}

// ─── Smart Chat: Auto-routes to best model ─────────────
export async function smartChat(
  userMessage: string,
  systemPrompt?: string,
  history?: OpenAI.ChatCompletionMessageParam[],
  category?: TaskCategory
): Promise<{ response: string; model: string; category: string }> {
  const model = routeToModel(userMessage, category);
  
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: systemPrompt || `You are Captain Q, an advanced AI assistant. You have been routed to the ${model} model because it's best suited for this type of request. Give your best answer.`,
    },
    ...(history || []),
    { role: 'user', content: userMessage },
  ];

  const response = await callModel(model, messages);

  // Determine which category was detected
  let detectedCategory: string = 'conversation';
  if (model === MODELS.GPT4O) detectedCategory = 'code/general';
  if (model === MODELS.CLAUDE_SONNET) detectedCategory = 'creative';
  if (model === MODELS.CLAUDE_OPUS) detectedCategory = 'analysis';
  if (model === MODELS.PERPLEXITY) detectedCategory = 'research';
  if (model === MODELS.DEEPSEEK) detectedCategory = 'math/logic';
  if (model === MODELS.FAST) detectedCategory = 'quick';

  return { response, model, category: detectedCategory };
}

// ─── Express Route Handler ─────────────────────────────
import type { Request, Response } from 'express';
import { z } from 'zod';

export async function handleSmartChat(req: Request, res: Response) {
  const schema = z.object({
    message: z.string(),
    history: z.array(z.any()).optional(),
    category: z.string().optional(),
    model: z.string().optional(), // Force a specific model
  });

  try {
    const { message, history, category, model } = schema.parse(req.body);

    // If user forces a specific model, use it directly
    if (model) {
      const messages: OpenAI.ChatCompletionMessageParam[] = [
        { role: 'system', content: 'You are Captain Q, an advanced AI assistant.' },
        ...(history || []),
        { role: 'user', content: message },
      ];
      const response = await callModel(model, messages);
      res.json({ success: true, response, model, category: 'forced' });
      return;
    }

    const result = await smartChat(message, undefined, history, category as TaskCategory);
    res.json({
      success: true,
      response: result.response,
      model: result.model,
      category: result.category,
    });
  } catch (err: any) {
    console.error('[SMART CHAT ERROR]', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─── Available Models Endpoint ─────────────────────────
export function handleListModels(_req: Request, res: Response) {
  res.json({
    models: MODELS,
    routing: {
      code: 'GPT-4o — Fast, accurate code generation',
      creative: 'Claude Sonnet 4 — Best writing and content creation',
      analysis: 'Claude Opus 4 — Deepest reasoning and complex problems',
      research: 'Perplexity Sonar Pro — Real-time web knowledge with citations',
      math: 'DeepSeek R1 — Cheapest reasoning for math and logic',
      quick: 'GPT-4o-mini — Ultra-fast for simple tasks',
      conversation: 'GPT-4o — General chat and brainstorming',
    },
  });
}
