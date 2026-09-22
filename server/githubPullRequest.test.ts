import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPullRequestFromProposal } from "./githubService";

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("approved GitHub pull-request execution", () => {
  const originalToken = process.env.GITHUB_TOKEN;

  beforeEach(() => {
    process.env.GITHUB_TOKEN = "github-test-token";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method || "GET";
        if (method === "GET" && url.includes("/git/ref/heads/main")) {
          return jsonResponse({ object: { sha: "base-commit-sha" } });
        }
        if (method === "GET" && url.includes("/git/commits/base-commit-sha")) {
          return jsonResponse({ tree: { sha: "base-tree-sha" } });
        }
        if (method === "POST" && url.endsWith("/git/blobs")) {
          return jsonResponse({ sha: `blob-${Math.random()}` }, 201);
        }
        if (method === "POST" && url.endsWith("/git/trees")) {
          return jsonResponse({ sha: "proposal-tree-sha" }, 201);
        }
        if (method === "POST" && url.endsWith("/git/commits")) {
          return jsonResponse({ sha: "proposal-commit-sha" }, 201);
        }
        if (method === "POST" && url.endsWith("/git/refs")) {
          return jsonResponse(
            { ref: "refs/heads/toriu/fix-settings-abc123" },
            201
          );
        }
        if (method === "POST" && url.endsWith("/pulls")) {
          return jsonResponse(
            {
              number: 42,
              html_url: "https://github.com/example/repo/pull/42",
            },
            201
          );
        }
        return jsonResponse(
          { message: `Unexpected request: ${method} ${url}` },
          500
        );
      })
    );
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
    vi.unstubAllGlobals();
  });

  it("creates one toriu branch, one commit, and one draft pull request with no merge request", async () => {
    const result = await createPullRequestFromProposal(1, {
      repository: "example/repo",
      baseBranch: "main",
      branchName: "toriu/fix-settings-abc123",
      title: "Fix settings controls",
      body: "Makes the controls actionable.",
      commitMessage: "fix: make settings controls actionable",
      files: [
        {
          path: "client/settings.tsx",
          content: "export const enabled = true;\n",
        },
        { path: "server/settings.ts", content: "export const saved = true;\n" },
      ],
    });

    expect(result).toEqual({
      number: 42,
      url: "https://github.com/example/repo/pull/42",
      commitSha: "proposal-commit-sha",
    });

    const calls = vi.mocked(fetch).mock.calls.map(([input, init]) => ({
      url: String(input),
      method: init?.method || "GET",
      body: init?.body ? JSON.parse(String(init.body)) : null,
    }));
    expect(
      calls.filter(call => call.method === "POST").map(call => call.url)
    ).toEqual([
      "https://api.github.com/repos/example/repo/git/blobs",
      "https://api.github.com/repos/example/repo/git/blobs",
      "https://api.github.com/repos/example/repo/git/trees",
      "https://api.github.com/repos/example/repo/git/commits",
      "https://api.github.com/repos/example/repo/git/refs",
      "https://api.github.com/repos/example/repo/pulls",
    ]);
    expect(calls.find(call => call.url.endsWith("/git/refs"))?.body).toEqual({
      ref: "refs/heads/toriu/fix-settings-abc123",
      sha: "proposal-commit-sha",
    });
    expect(calls.find(call => call.url.endsWith("/pulls"))?.body).toMatchObject(
      {
        head: "toriu/fix-settings-abc123",
        base: "main",
        draft: true,
      }
    );
    expect(calls.some(call => /merge/i.test(call.url))).toBe(false);
    expect(
      calls.some(call => ["PATCH", "PUT", "DELETE"].includes(call.method))
    ).toBe(false);
  });

  it("rejects branches outside the toriu namespace before any GitHub write", async () => {
    await expect(
      createPullRequestFromProposal(1, {
        repository: "example/repo",
        baseBranch: "main",
        branchName: "main",
        title: "Unsafe change",
        body: "",
        commitMessage: "unsafe",
        files: [{ path: "README.md", content: "unsafe" }],
      })
    ).rejects.toThrow("toriu/ namespace");
    expect(vi.mocked(fetch).mock.calls).toHaveLength(0);
  });
});
