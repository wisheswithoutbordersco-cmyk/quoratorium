export const CAPTAIN_OPENROUTER_MODEL =
  process.env.CAPTAIN_MODEL?.trim() || "openai/gpt-5.2-chat";

export const CAPTAIN_FORGE_MODEL =
  process.env.CAPTAIN_FORGE_MODEL?.trim() || "gpt-5";

export const CAPTAIN_OPENAI_MODEL =
  process.env.OPENAI_CHAT_MODEL?.trim() || "gpt-5";

export const CAPTAIN_MAX_OUTPUT_TOKENS = 8192;

export function isGpt5Family(model: string): boolean {
  return /(?:^|\/)gpt-5(?:[.\-]|$)/i.test(model);
}

export function getCaptainReasoning(model: string): Record<string, unknown> | undefined {
  if (/-chat(?:$|:)/i.test(model)) return undefined;
  return isGpt5Family(model) ? { effort: "low" } : undefined;
}
