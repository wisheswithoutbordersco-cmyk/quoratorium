import { describe, expect, it } from "vitest";
import { extractImagePrompt, isImageRequest } from "./imageWorker";

describe("isImageRequest", () => {
  it.each([
    "So without trying to generate a picture, you cannot see the one I loaded up?",
    "Can you see the picture I uploaded?",
    "Give me a crazy horror prompt that's funny that I can copy paste in my generator",
    "Do not generate an image; just describe this one.",
    "I wasn't asking you to create artwork.",
  ])("keeps discussion and negated requests in chat: %s", message => {
    expect(isImageRequest(message)).toBe(false);
  });

  it.each([
    "Generate a picture of a haunted toaster",
    "Create an image of a funny ghost chef",
    "Draw me a moonlit castle",
    "Make a logo for my classroom project",
    "I want a poster of a neon dinosaur",
  ])("detects explicit image creation: %s", message => {
    expect(isImageRequest(message)).toBe(true);
  });
});

describe("extractImagePrompt", () => {
  it("removes a direct generation prefix", () => {
    expect(extractImagePrompt("Generate a picture of a haunted toaster")).toBe(
      "a haunted toaster"
    );
  });
});
