import type { MessageContent } from "./_core/llm";

export const MAX_CHAT_ATTACHMENTS = 4;
export const MAX_CHAT_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_CHAT_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024;

export const IMAGE_ANALYSIS_GUIDANCE = `

IMAGE ANALYSIS RULES — APPLY WHEN AN IMAGE IS ATTACHED:
- Inspect the attached image and answer the user's actual visual question directly.
- You ARE allowed to count visible people or characters and state the count.
- You ARE allowed to describe visible people or characters, including clothing, pose, expression, approximate age range, composition, and actions.
- You ARE allowed and expected to identify recognizable fictional characters, dolls, mascots, creatures, and characters from movies, television, books, comics, games, or folklore by their character names. Examples include Chucky, Mickey Mouse, Batman, Shrek, and Santa Claus.
- If the user asks a fictional character's name, answer with the most likely character name first. If uncertain, say "This appears to be [character]" and briefly explain the visual clues.
- The real-person identity restriction applies only to identifying an actual human being from their face. It does NOT apply to fictional characters, dolls, toys, mascots, costumes, illustrations, or stylized artwork.
- Do NOT refuse merely because an image contains a person or face. Counting, describing, or naming a fictional character is not real-person identity recognition.
- Do NOT identify an unknown real human by name, confirm that a real human face belongs to a named person, or perform biometric matching.
- If real-person identity was not requested, do not mention identity-recognition limitations.
- For questions such as "How many people are in this picture?", answer with the number first and briefly explain what is visible.
- If the image is ambiguous, give the best visual estimate and state the uncertainty instead of refusing.`;

export function addImageAnalysisGuidance(systemPrompt: string, imageCount: number): string {
  return imageCount > 0 ? `${systemPrompt}${IMAGE_ANALYSIS_GUIDANCE}` : systemPrompt;
}

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export interface ChatAttachmentInput {
  id?: string;
  name: string;
  type: string;
  size: number;
  dataUrl?: string;
}

export interface ChatAttachment {
  id?: string;
  name: string;
  type: string;
  size: number;
  dataUrl?: string;
}

export interface ParsedChatAttachments {
  attachments: ChatAttachment[];
  imageAttachments: ChatAttachment[];
}

function normalizeFileName(value: unknown, index: number): string {
  if (typeof value !== "string") return `attachment-${index + 1}`;
  const trimmed = value.trim();
  return (trimmed || `attachment-${index + 1}`).slice(0, 255);
}

function parseImageDataUrl(
  dataUrl: string,
  declaredType: string
): { mimeType: string; byteLength: number } | null {
  const match = dataUrl.match(
    /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/i
  );
  if (!match) return null;

  const mimeType = match[1].toLowerCase();
  if (
    !SUPPORTED_IMAGE_TYPES.has(mimeType) ||
    mimeType !== declaredType.toLowerCase()
  )
    return null;

  try {
    const byteLength = Buffer.from(
      match[2].replace(/\s/g, ""),
      "base64"
    ).byteLength;
    return { mimeType, byteLength };
  } catch {
    return null;
  }
}

export function parseChatAttachments(input: unknown): ParsedChatAttachments {
  if (!Array.isArray(input)) return { attachments: [], imageAttachments: [] };

  const attachments: ChatAttachment[] = [];
  const imageAttachments: ChatAttachment[] = [];
  let totalImageBytes = 0;

  const candidates = input.slice(0, MAX_CHAT_ATTACHMENTS);
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (!candidate || typeof candidate !== "object") continue;

    const raw = candidate as Record<string, unknown>;
    const type =
      typeof raw.type === "string"
        ? raw.type.toLowerCase().trim()
        : "application/octet-stream";
    const size =
      typeof raw.size === "number" && Number.isFinite(raw.size) && raw.size >= 0
        ? raw.size
        : 0;
    const attachment: ChatAttachment = {
      id: typeof raw.id === "string" ? raw.id.slice(0, 128) : undefined,
      name: normalizeFileName(raw.name, index),
      type,
      size,
    };

    if (typeof raw.dataUrl === "string" && type.startsWith("image/")) {
      const parsed = parseImageDataUrl(raw.dataUrl, type);
      if (
        !parsed ||
        parsed.byteLength > MAX_CHAT_IMAGE_BYTES ||
        totalImageBytes + parsed.byteLength > MAX_CHAT_TOTAL_IMAGE_BYTES
      ) continue;
      attachment.size = parsed.byteLength;
      attachment.dataUrl = raw.dataUrl;
      totalImageBytes += parsed.byteLength;
      imageAttachments.push(attachment);
    }

    attachments.push(attachment);
  }

  return { attachments, imageAttachments };
}

export function buildChatUserContent(
  message: string,
  imageAttachments: ChatAttachment[]
): string | MessageContent[] {
  if (imageAttachments.length === 0) return message;

  const text = message.trim() || "Please describe the attached image.";
  return [
    { type: "text", text },
    ...imageAttachments.flatMap<MessageContent>(attachment =>
      attachment.dataUrl
        ? [
            {
              type: "image_url",
              image_url: { url: attachment.dataUrl, detail: "high" },
            },
          ]
        : []
    ),
  ];
}

export function normalizeChatHistory(
  input: unknown
): Array<{ role: "user" | "assistant"; content: string | MessageContent[] }> {
  if (!Array.isArray(input)) return [];

  const normalized: Array<{
    role: "user" | "assistant";
    content: string | MessageContent[];
  }> = [];
  const candidates = input.slice(-10);
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (!candidate || typeof candidate !== "object") continue;
    const raw = candidate as Record<string, unknown>;
    if (raw.role !== "user" && raw.role !== "assistant") continue;

    if (typeof raw.content === "string") {
      normalized.push({
        role: raw.role,
        content: raw.content.slice(0, 20_000),
      });
      continue;
    }

    if (!Array.isArray(raw.content)) continue;
    const parts: MessageContent[] = [];
    for (let partIndex = 0; partIndex < raw.content.length; partIndex += 1) {
      const part = raw.content[partIndex];
      if (!part || typeof part !== "object") continue;
      const value = part as Record<string, any>;
      if (value.type === "text" && typeof value.text === "string") {
        parts.push({ type: "text", text: value.text.slice(0, 20_000) });
        continue;
      }
      if (
        raw.role === "user" &&
        value.type === "image_url" &&
        typeof value.image_url?.url === "string"
      ) {
        const dataUrl = value.image_url.url;
        const mimeTypeMatch = dataUrl.match(
          /^data:(image\/(?:jpeg|png|webp|gif));base64,/i
        );
        const parsed = mimeTypeMatch
          ? parseImageDataUrl(dataUrl, mimeTypeMatch[1])
          : null;
        if (parsed && parsed.byteLength <= MAX_CHAT_IMAGE_BYTES) {
          parts.push({
            type: "image_url",
            image_url: { url: dataUrl, detail: "high" },
          });
        }
      }
    }

    if (parts.length > 0) normalized.push({ role: raw.role, content: parts });
  }

  return normalized;
}

export function attachmentMetadata(attachments: ChatAttachment[]) {
  return attachments.map(({ id, name, type, size }) => ({
    id,
    name,
    type,
    size,
  }));
}
