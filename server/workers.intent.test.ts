import { describe, expect, it } from "vitest";
import { detectIntent } from "./workers";

describe("detectIntent", () => {
  it.each([
    "Give me a crazy horror prompt that's funny that I can copy paste in my generator",
    "Can you see the picture I uploaded?",
    "Write me a funny caption for this",
  ])("keeps ordinary conversation out of build mode: %s", (message) => {
    expect(detectIntent(message)).toBe("chat");
  });

  it.each([
    "Build a website for my classroom resources",
    "Implement a dashboard component",
    "Write code for an API endpoint",
  ])("still routes explicit implementation work to build mode: %s", (message) => {
    expect(detectIntent(message)).toBe("build");
  });

  it("uses the shared negation-aware image classifier", () => {
    expect(detectIntent("Do not generate an image; just explain the prompt.")).toBe("chat");
    expect(detectIntent("Generate an image of a haunted toaster")).toBe("image_gen");
  });
});
