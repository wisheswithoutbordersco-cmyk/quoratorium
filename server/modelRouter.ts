/**
 * Q Workspace — Smart Model Router
 * 
 * Analyzes task complexity and routes to the most cost-effective model.
 * Features:
 * - Complexity scoring for incoming tasks
 * - Cost-tier routing (cheap → mid → premium)
 * - Fallback chains when primary model fails
 * - Worker-specific model preferences
 */

export type CostTier = "budget" | "standard" | "premium";

export interface ModelConfig {
  model: string;
  tier: CostTier;
  costPerMToken: number; // approximate combined cost per 1M tokens
  maxTokens: number;
  strengths: string[];
}

// ─── Available Models ─────────────────────────────────────────────────────────

export const MODELS: Record<string, ModelConfig> = {
  "gpt-4o-mini": {
    model: "gpt-4o-mini",
    tier: "budget",
    costPerMToken: 0.375, // avg of input/output
    maxTokens: 16384,
    strengths: ["formatting", "simple_edits", "classification", "extraction", "summarization"],
  },
  "gpt-4o": {
    model: "gpt-4o",
    tier: "premium",
    costPerMToken: 6.25,
    maxTokens: 16384,
    strengths: ["code_generation", "complex_reasoning", "architecture", "creative", "multimodal"],
  },
  "claude-sonnet": {
    model: "claude-sonnet-4-20250514",
    tier: "premium",
    costPerMToken: 9.0,
    maxTokens: 8192,
    strengths: ["code_review", "analysis", "safety", "long_context", "detailed_explanation"],
  },
  "sonar": {
    model: "sonar",
    tier: "budget",
    costPerMToken: 1.0,
    maxTokens: 4096,
    strengths: ["research", "web_search", "current_events", "fact_checking"],
  },
};

// ─── Complexity Analysis ──────────────────────────────────────────────────────

export interface ComplexityScore {
  score: number; // 1-10
  factors: string[];
  recommendedTier: CostTier;
  estimatedTokens: number;
}

/**
 * Analyze task complexity to determine appropriate model tier
 */
export function analyzeComplexity(message: string, context?: { history?: number; hasAttachments?: boolean; projectType?: string }): ComplexityScore {
  let score = 3; // base score
  const factors: string[] = [];

  // Length-based complexity
  if (message.length > 2000) { score += 2; factors.push("long_input"); }
  else if (message.length > 500) { score += 1; factors.push("medium_input"); }

  // Code-related keywords boost complexity
  const codeKeywords = /\b(implement|build|create|architect|refactor|debug|optimize|deploy|full.?stack|api|database|schema|algorithm)\b/i;
  if (codeKeywords.test(message)) { score += 2; factors.push("code_task"); }

  // Simple task keywords reduce complexity
  const simpleKeywords = /\b(format|fix typo|rename|list|summarize|translate|convert|explain briefly)\b/i;
  if (simpleKeywords.test(message)) { score -= 2; factors.push("simple_task"); }

  // Multi-step indicators
  const multiStep = /\b(then|after that|next|also|and then|step \d|phase \d|first.*then)\b/i;
  if (multiStep.test(message)) { score += 1; factors.push("multi_step"); }

  // Research indicators
  const researchKeywords = /\b(research|find out|what is|compare|analyze market|trends|latest)\b/i;
  if (researchKeywords.test(message)) { factors.push("research_needed"); }

  // Context factors
  if (context?.history && context.history > 5) { score += 1; factors.push("long_conversation"); }
  if (context?.hasAttachments) { score += 1; factors.push("has_attachments"); }

  // Clamp score
  score = Math.max(1, Math.min(10, score));

  // Determine tier
  let recommendedTier: CostTier;
  if (score <= 3) recommendedTier = "budget";
  else if (score <= 6) recommendedTier = "standard";
  else recommendedTier = "premium";

  // Estimate tokens
  const estimatedTokens = Math.max(500, Math.min(50000, message.length * 2 + score * 2000));

  return { score, factors, recommendedTier, estimatedTokens };
}

// ─── Model Selection ──────────────────────────────────────────────────────────

export interface ModelSelection {
  primary: string;
  fallback: string;
  tier: CostTier;
  reason: string;
  estimatedCost: number;
}

/**
 * Select the best model for a given worker and complexity
 */
export function selectModel(
  worker: string,
  complexity: ComplexityScore,
  budgetRemaining?: number
): ModelSelection {
  // Worker-specific routing
  switch (worker) {
    case "research":
    case "researcher":
      return {
        primary: "sonar",
        fallback: "gpt-4o-mini",
        tier: "budget",
        reason: "Research tasks use Perplexity for grounded results",
        estimatedCost: calculateEstimatedCost("sonar", complexity.estimatedTokens),
      };

    case "validator":
    case "code_review":
      return {
        primary: "claude-sonnet-4-20250514",
        fallback: "gpt-4o",
        tier: "premium",
        reason: "Code review benefits from Claude's thorough analysis",
        estimatedCost: calculateEstimatedCost("claude-sonnet-4-20250514", complexity.estimatedTokens),
      };

    case "builder":
    case "code_generation":
      if (complexity.recommendedTier === "budget") {
        return {
          primary: "gpt-4o-mini",
          fallback: "gpt-4o",
          tier: "budget",
          reason: "Simple code task routed to budget model",
          estimatedCost: calculateEstimatedCost("gpt-4o-mini", complexity.estimatedTokens),
        };
      }
      return {
        primary: "gpt-4o",
        fallback: "gpt-4o-mini",
        tier: "premium",
        reason: "Complex code generation uses GPT-4o for quality",
        estimatedCost: calculateEstimatedCost("gpt-4o", complexity.estimatedTokens),
      };

    case "captain":
    case "orchestrator":
      // Captain routing is always budget since it's just classification
      return {
        primary: "gpt-4o-mini",
        fallback: "gpt-4o",
        tier: "budget",
        reason: "Orchestration/routing uses budget model",
        estimatedCost: calculateEstimatedCost("gpt-4o-mini", complexity.estimatedTokens / 2),
      };

    default:
      // Default routing based on complexity
      if (complexity.recommendedTier === "budget" || (budgetRemaining !== undefined && budgetRemaining < 1)) {
        return {
          primary: "gpt-4o-mini",
          fallback: "gpt-4o",
          tier: "budget",
          reason: budgetRemaining !== undefined && budgetRemaining < 1
            ? "Budget low — using cost-effective model"
            : "Simple task routed to budget model",
          estimatedCost: calculateEstimatedCost("gpt-4o-mini", complexity.estimatedTokens),
        };
      }
      return {
        primary: "gpt-4o",
        fallback: "gpt-4o-mini",
        tier: "premium",
        reason: "Complex task uses premium model",
        estimatedCost: calculateEstimatedCost("gpt-4o", complexity.estimatedTokens),
      };
  }
}

function calculateEstimatedCost(model: string, estimatedTokens: number): number {
  const config = MODELS[model] || MODELS["gpt-4o-mini"];
  return Math.round((estimatedTokens / 1_000_000) * config.costPerMToken * 10000) / 10000;
}

/**
 * Get fallback model when primary fails
 */
export function getFallbackModel(failedModel: string): string | null {
  const fallbackChain: Record<string, string[]> = {
    "gpt-4o": ["gpt-4o-mini"],
    "claude-sonnet-4-20250514": ["gpt-4o", "gpt-4o-mini"],
    "sonar": ["gpt-4o-mini"],
    "gpt-4o-mini": [], // no cheaper fallback
  };

  const chain = fallbackChain[failedModel];
  return chain && chain.length > 0 ? chain[0] : null;
}
