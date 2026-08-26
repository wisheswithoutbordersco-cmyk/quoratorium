import { describe, expect, it } from "vitest";
import {
  MAX_CHAT_ATTACHMENTS,
  buildChatUserContent,
  normalizeChatHistory,
  parseChatAttachments,
} from "./chatAttachments";

const tinyPng = `data:image/png;base64,${Buffer.from("tiny-image").toString("base64")}`;

describe("chat attachments", () => {
  it("converts a valid uploaded image into multimodal chat content", () => {
    const parsed = parseChatAttachments([
      {
        id: "upload-1",
        name: "reference.png",
        type: "image/png",
        size: 999,
        dataUrl: tinyPng,
      },
    ]);

    expect(parsed.attachments).toEqual([
      expect.objectContaining({
        id: "upload-1",
        name: "reference.png",
        type: "image/png",
        size: Buffer.from("tiny-image").byteLength,
        dataUrl: tinyPng,
      }),
    ]);
    expect(
      buildChatUserContent("Can you see this?", parsed.imageAttachments)
    ).toEqual([
      { type: "text", text: "Can you see this?" },
      { type: "image_url", image_url: { url: tinyPng, detail: "high" } },
    ]);
  });

  it("uses a useful default prompt when an image is sent without text", () => {
    const parsed = parseChatAttachments([
      { name: "photo.png", type: "image/png", size: 10, dataUrl: tinyPng },
    ]);

    expect(buildChatUserContent("", parsed.imageAttachments)).toEqual([
      { type: "text", text: "Please describe the attached image." },
      { type: "image_url", image_url: { url: tinyPng, detail: "high" } },
    ]);
  });

  it("rejects mismatched or unsupported image payloads", () => {
    const parsed = parseChatAttachments([
      { name: "fake.jpg", type: "image/jpeg", size: 10, dataUrl: tinyPng },
      {
        name: "vector.svg",
        type: "image/svg+xml",
        size: 10,
        dataUrl: "data:image/svg+xml;base64,PHN2Zz4=",
      },
    ]);

    expect(parsed.attachments).toEqual([]);
    expect(parsed.imageAttachments).toEqual([]);
  });

  it("caps the number of accepted attachments", () => {
    const parsed = parseChatAttachments(
      Array.from({ length: MAX_CHAT_ATTACHMENTS + 2 }, (_, index) => ({
        id: `upload-${index}`,
        name: `image-${index}.png`,
        type: "image/png",
        size: 10,
        dataUrl: tinyPng,
      }))
    );

    expect(parsed.attachments).toHaveLength(MAX_CHAT_ATTACHMENTS);
    expect(parsed.imageAttachments).toHaveLength(MAX_CHAT_ATTACHMENTS);
  });

  it("preserves valid image history for a follow-up question", () => {
    expect(
      normalizeChatHistory([
        {
          role: "user",
          content: [
            { type: "text", text: "Can you see this picture?" },
            { type: "image_url", image_url: { url: tinyPng, detail: "high" } },
          ],
        },
        { role: "assistant", content: "Yes, I can see it." },
      ])
    ).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "Can you see this picture?" },
          { type: "image_url", image_url: { url: tinyPng, detail: "high" } },
        ],
      },
      { role: "assistant", content: "Yes, I can see it." },
    ]);
  });
});
