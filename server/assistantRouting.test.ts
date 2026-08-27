import { describe, expect, it } from "vitest";
import { detectCaptainRoute } from "./assistantRouting";

describe("detectCaptainRoute", () => {
  it.each([
    "Hello, how are you?",
    "What is this character's name?",
    "Who is Chucky?",
    "How many people are in this picture?",
    "Give me a funny horror prompt I can paste into my generator",
    "Create an image of a haunted toaster",
    "Research the latest trends in classroom decor",
    "Compare Shopify and Etsy for my products",
    "Build me a landing page",
    "Review this design and tell me what to improve",
    "What do you think I should work on next?",
    "https://example.com is the site I mentioned earlier",
  ])("keeps semantic interpretation in the general assistant: %s", (message) => {
    expect(detectCaptainRoute(message)).toBe("chat");
  });

  it("keeps every attached-image question in multimodal chat", () => {
    expect(detectCaptainRoute("Generate a picture like the one I attached", true)).toBe("chat");
  });

  it.each([
    "Run this code:\n```js\nconsole.log('hello')\n```",
    "Execute the following script:\n```python\nprint(2 + 2)\n```",
  ])("routes unmistakable code execution: %s", (message) => {
    expect(detectCaptainRoute(message)).toBe("execute");
  });

  it.each([
    "Open https://example.com and read the page",
    "Take a screenshot of https://example.com",
    "Scrape https://example.com for pricing",
  ])("routes explicit browser actions: %s", (message) => {
    expect(detectCaptainRoute(message)).toBe("browser");
  });
});
