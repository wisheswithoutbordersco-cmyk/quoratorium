export type CaptainRoute = "chat" | "browser" | "execute";

const CODE_BLOCK_PATTERN = /```[\s\S]*?```/;
const EXECUTION_REQUEST_PATTERN = /\b(?:run|execute|test)\b[^.!?]{0,50}\b(?:this|the following|code|script|snippet)\b/i;
const URL_PATTERN = /https?:\/\/[^\s"'<>]+/i;
const BROWSER_ACTION_PATTERN = /\b(?:open|visit|browse|read|inspect|extract|scrape|capture|screenshot)\b/i;

/**
 * Deterministic routing is intentionally narrow. Captain Q's model should
 * interpret conversation, research, writing, vision, creation, and tool needs
 * from the complete request rather than from isolated words.
 */
export function detectCaptainRoute(message: string, hasImageAttachment = false): CaptainRoute {
  if (hasImageAttachment) return "chat";

  if (CODE_BLOCK_PATTERN.test(message) && EXECUTION_REQUEST_PATTERN.test(message)) {
    return "execute";
  }

  if (URL_PATTERN.test(message) && BROWSER_ACTION_PATTERN.test(message)) {
    return "browser";
  }

  return "chat";
}
