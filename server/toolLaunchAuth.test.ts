import { afterEach, describe, expect, it } from "vitest";
import {
  TOOL_LAUNCH_TTL_MS,
  issueToolLaunchTicket,
  launchUrlFor,
  verifyToolLaunchTicket,
} from "./toolLaunchAuth";

const secret = "a".repeat(40);
const original = {
  templatorium: process.env.QUORATORIUM_TEMPLATORIUM_SSO_SECRET,
  extractorium: process.env.QUORATORIUM_EXTRACTORIUM_SSO_SECRET,
};

afterEach(() => {
  if (original.templatorium === undefined)
    delete process.env.QUORATORIUM_TEMPLATORIUM_SSO_SECRET;
  else process.env.QUORATORIUM_TEMPLATORIUM_SSO_SECRET = original.templatorium;
  if (original.extractorium === undefined)
    delete process.env.QUORATORIUM_EXTRACTORIUM_SSO_SECRET;
  else process.env.QUORATORIUM_EXTRACTORIUM_SSO_SECRET = original.extractorium;
});

describe("secure external-tool launch tickets", () => {
  it("binds a short-lived ticket to its intended tool and owner", () => {
    process.env.QUORATORIUM_TEMPLATORIUM_SSO_SECRET = secret;
    const now = 1_700_000_000_000;
    const ticket = issueToolLaunchTicket("templatorium", 42, now);

    expect(
      verifyToolLaunchTicket(ticket, "templatorium", secret, now)
    ).toMatchObject({
      audience: "templatorium",
      subject: 42,
    });
    expect(
      verifyToolLaunchTicket(ticket, "extractorium", secret, now)
    ).toBeNull();
    expect(
      verifyToolLaunchTicket(
        ticket,
        "templatorium",
        secret,
        now + TOOL_LAUNCH_TTL_MS
      )
    ).toBeNull();
  });

  it("keeps the credential in a URL fragment rather than a request query", () => {
    process.env.QUORATORIUM_TEMPLATORIUM_SSO_SECRET = secret;
    const url = new URL(launchUrlFor("templatorium", 42, 1_700_000_000_000));
    expect(url.pathname).toBe("/launch");
    expect(url.search).toBe("");
    expect(url.hash).toMatch(/^#ticket=/);
  });
});
