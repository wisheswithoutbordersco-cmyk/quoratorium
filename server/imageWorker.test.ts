import { describe, expect, it } from "vitest";
import {
  buildImageVariationPrompt,
  enhanceImagePrompt,
  extractImagePrompt,
  getRequestedImageCount,
  isImageRequest,
} from "./imageWorker";

describe("isImageRequest", () => {
  it.each([
    "So without trying to generate a picture, you cannot see the one I loaded up?",
    "Can you see the picture I uploaded?",
    "Give me a crazy horror prompt that's funny that I can copy paste in my generator",
    "Write me an image prompt for a classroom poster",
    "Do not generate an image; just describe this one.",
    "I wasn't asking you to create artwork.",
  ])("keeps discussion, prompt writing, and negated requests in chat: %s", (message) => {
    expect(isImageRequest(message)).toBe(false);
  });

  it.each([
    "Generate a picture of a haunted toaster",
    "Create an image of a funny ghost chef",
    "Draw me a moonlit castle",
    "Make a logo for my classroom project",
    "I want a poster of a neon dinosaur",
    "Create three product mockups for this printable",
    "Make me some Shopify listing mockups",
  ])("detects unmistakable image creation: %s", (message) => {
    expect(isImageRequest(message)).toBe(true);
  });
});

describe("extractImagePrompt", () => {
  it("removes a direct generation prefix", () => {
    expect(extractImagePrompt("Generate a picture of a haunted toaster")).toBe(
      "a haunted toaster",
    );
  });

  it("keeps the useful subject after a multi-mockup prefix", () => {
    expect(extractImagePrompt("Create three product mockups for my ELA workbook")).toBe(
      "my ELA workbook",
    );
  });
});

describe("getRequestedImageCount", () => {
  it.each([
    ["Create three product mockups", 3],
    ["Make 2 different images", 2],
    ["Generate some mockups", 3],
    ["Create an image of a fox", 1],
    ["Create 20 mockups", 4],
  ])("returns a bounded count for %s", (message, expected) => {
    expect(getRequestedImageCount(message)).toBe(expected);
  });

  it("builds distinct variation instructions only for multi-image requests", () => {
    expect(buildImageVariationPrompt("A product mockup", 1, 3)).toContain("variation 2 of 3");
    expect(buildImageVariationPrompt("A product mockup", 0, 1)).toBe("A product mockup");
  });
});

describe("enhanceImagePrompt", () => {
  it("adds product framing, exact-text, and no-invented-content constraints to mockups", () => {
    const result = enhanceImagePrompt("A Shopify product mockup for Click, Post, Exist");

    expect(result).toContain("Keep the complete featured product fully visible");
    expect(result).toContain("Preserve any wording supplied by the user exactly");
    expect(result).toContain("do not invent extra pages");
  });

  it("does not rewrite ordinary artwork prompts", () => {
    const prompt = "A watercolor fox under a moonlit sky";
    expect(enhanceImagePrompt(prompt)).toBe(prompt);
  });
});
