import { describe, expect, it } from "vitest";
import { CAPTAIN_Q_SYSTEM_PROMPT, CAPTAIN_Q_TOOL_GUIDANCE } from "./captainQPrompt";

describe("Captain Q assistant contract", () => {
  it("requires semantic interpretation and direct general-assistant behavior", () => {
    expect(CAPTAIN_Q_SYSTEM_PROMPT).toContain("full message, conversation, attachments, and context");
    expect(CAPTAIN_Q_SYSTEM_PROMPT).toContain("Never decide what the user wants from one isolated keyword");
    expect(CAPTAIN_Q_SYSTEM_PROMPT).toContain("Answer the actual question directly");
  });

  it("allows broad visual understanding while keeping the real-person boundary narrow", () => {
    expect(CAPTAIN_Q_SYSTEM_PROMPT).toContain("identify recognizable fictional characters");
    expect(CAPTAIN_Q_SYSTEM_PROMPT).toContain("if an image clearly depicts Chucky");
    expect(CAPTAIN_Q_SYSTEM_PROMPT).toContain("applies only to identifying or confirming an actual human being from their face");
  });

  it("separates prompt writing, image understanding, and image creation", () => {
    expect(CAPTAIN_Q_SYSTEM_PROMPT).toContain("write the prompt only. Do not generate an image");
    expect(CAPTAIN_Q_SYSTEM_PROMPT).toContain("Do not generate a replacement image unless the user clearly asks");
    expect(CAPTAIN_Q_TOOL_GUIDANCE).toContain("only for an explicit request to create a new visual");
  });

  it("makes tools optional and forbids generic autonomous-tool announcements", () => {
    expect(CAPTAIN_Q_SYSTEM_PROMPT).toContain("Conversation is the default");
    expect(CAPTAIN_Q_TOOL_GUIDANCE).toContain("Tools are optional capabilities, not the default response mode");
    expect(CAPTAIN_Q_SYSTEM_PROMPT).toContain("Never announce generic \"autonomous tool use.\"");
  });
});
