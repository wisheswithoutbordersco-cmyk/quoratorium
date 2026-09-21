import { beforeEach, describe, expect, it, vi } from "vitest";

let storedConnection: Record<string, any> | null = null;
let queryError: Record<string, any> | null = null;

const connectionQuery: any = {
  data: [],
  error: null,
  select: vi.fn(() => connectionQuery),
  eq: vi.fn(() => connectionQuery),
  limit: vi.fn(() => connectionQuery),
  single: vi.fn(async () => ({ data: storedConnection, error: queryError })),
  upsert: vi.fn(async (value: Record<string, any>) => {
    storedConnection = { id: 1, ...value };
    return { data: storedConnection, error: queryError };
  }),
  update: vi.fn((value: Record<string, any>) => {
    storedConnection = { ...(storedConnection || { id: 1 }), ...value };
    return connectionQuery;
  }),
  delete: vi.fn(() => connectionQuery),
};

vi.mock("./supabase", () => ({
  getSupabaseAdmin: vi.fn(() => ({ from: vi.fn(() => connectionQuery) })),
}));

vi.mock("./actionAudit", () => ({
  reconcileIncompleteActionAudits: vi.fn().mockResolvedValue(0),
  recordActionAudit: vi.fn().mockResolvedValue({ id: "intent-1" }),
  recordTerminalActionAudit: vi.fn().mockResolvedValue({ id: "terminal-1" }),
}));

vi.mock("./serviceAuthorization", () => ({
  mayUseOwnerIntegrationCredentials: vi.fn().mockResolvedValue(false),
}));

import { recordActionAudit, recordTerminalActionAudit } from "./actionAudit";
import { mayUseOwnerIntegrationCredentials } from "./serviceAuthorization";
import {
  connectGitHub,
  createBranch,
  createRepo,
  getRepository,
  getSystemGitHubUsername,
  listRepos,
  mergePullRequest,
  pushFiles,
  readRepositoryFile,
} from "./githubService";

async function connectPersonalToken(repositories = ["example/repo"]) {
  vi.mocked(fetch)
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ login: "owner" }), { status: 200 })
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 1,
          full_name: repositories[0],
          default_branch: "main",
        }),
        { status: 200 }
      )
    );
  const connection = await connectGitHub(
    7,
    "github_pat_read_only_test_token",
    repositories
  );
  vi.mocked(fetch).mockReset();
  vi.mocked(recordActionAudit).mockClear();
  vi.mocked(recordTerminalActionAudit).mockClear();
  return connection;
}

beforeEach(() => {
  vi.clearAllMocks();
  storedConnection = null;
  queryError = null;
  connectionQuery.data = [];
  connectionQuery.error = null;
  process.env.NODE_ENV = "test";
  process.env.INTEGRATION_CREDENTIAL_KEY =
    "test-key-that-is-at-least-thirty-two-characters-long";
  delete process.env.JWT_SECRET;
  delete process.env.CLERK_SECRET_KEY;
  delete process.env.GITHUB_TOKEN;
  vi.mocked(mayUseOwnerIntegrationCredentials).mockResolvedValue(false);
  vi.stubGlobal("fetch", vi.fn());
});

describe("GitHub read-only service", () => {
  it("audits account and repository verification before storing a connection", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ login: "owner" }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ full_name: "example/repo" }), {
          status: 200,
        })
      );

    await connectGitHub(7, "github_pat_read_only_test_token", ["example/repo"]);

    expect(recordActionAudit).toHaveBeenCalledTimes(2);
    expect(recordActionAudit).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        actionId: "github.connection.verify",
        outcome: "allowed",
        details: { step: "account" },
      })
    );
    expect(recordActionAudit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        actionId: "github.connection.verify",
        outcome: "allowed",
        target: "example/repo",
      })
    );
    expect(recordTerminalActionAudit).toHaveBeenCalledTimes(2);
  });

  it("does not send a connection token when the verification intent cannot be audited", async () => {
    vi.mocked(recordActionAudit).mockRejectedValueOnce(
      new Error("audit unavailable")
    );

    await expect(
      connectGitHub(7, "github_pat_read_only_test_token", ["example/repo"])
    ).rejects.toThrow("audit unavailable");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("persists a selected-repository allowlist with authenticated encrypted credentials", async () => {
    const result = await connectPersonalToken(["example/repo"]);

    expect(result.repositories).toEqual(["example/repo"]);
    expect(connectionQuery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 7,
        username: "owner",
        allowed_repositories: ["example/repo"],
        token_encrypted: expect.stringMatching(/^v2:/),
      }),
      { onConflict: "user_id" }
    );
    expect(storedConnection?.token_encrypted).not.toContain(
      "github_pat_read_only_test_token"
    );
  });

  it("lists only allowlisted repositories and records intent before success", async () => {
    await connectPersonalToken(["wisheswithoutbordersco-cmyk/quoratorium"]);
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 1,
          name: "quoratorium",
          full_name: "wisheswithoutbordersco-cmyk/quoratorium",
          description: "Toríu",
          private: true,
          html_url:
            "https://github.com/wisheswithoutbordersco-cmyk/quoratorium",
          default_branch: "main",
          language: "TypeScript",
          updated_at: "2026-09-21T00:00:00Z",
          stargazers_count: 0,
          visibility: "private",
          archived: false,
          permissions: { admin: true, push: true, pull: true },
        }),
        { status: 200 }
      )
    );

    const repositories = await listRepos(7, 25);

    expect(repositories).toHaveLength(1);
    expect(repositories[0]).toEqual(
      expect.objectContaining({
        fullName: "wisheswithoutbordersco-cmyk/quoratorium",
        defaultBranch: "main",
      })
    );
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/repos/wisheswithoutbordersco-cmyk/quoratorium"),
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer github_pat_read_only_test_token",
        }),
      })
    );
    expect(
      vi.mocked(recordActionAudit).mock.calls.map(([record]) => record.outcome)
    ).toEqual(["allowed"]);
    expect(recordTerminalActionAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        intentId: "intent-1",
        outcome: "succeeded",
      })
    );
  });

  it("does not contact GitHub when the pre-action audit cannot be persisted", async () => {
    await connectPersonalToken();
    vi.mocked(recordActionAudit).mockRejectedValueOnce(
      new Error("audit unavailable")
    );

    await expect(listRepos(7)).rejects.toThrow("audit unavailable");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reads a bounded text file from an allowlisted repository", async () => {
    await connectPersonalToken();
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ default_branch: "main" }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            type: "file",
            path: "server/index.ts",
            sha: "abc123",
            size: 21,
            encoding: "base64",
            content: Buffer.from("export const ok = true;").toString("base64"),
            html_url:
              "https://github.com/example/repo/blob/main/server/index.ts",
          }),
          { status: 200 }
        )
      );

    const file = await readRepositoryFile(7, "example/repo", "server/index.ts");

    expect(file.ref).toBe("main");
    expect(file.content).toBe("export const ok = true;");
    expect(recordTerminalActionAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: "github.repository.file.read",
        outcome: "succeeded",
      })
    );
  });

  it("rejects non-allowlisted repositories before sending a GitHub request", async () => {
    await connectPersonalToken(["example/repo"]);

    await expect(getRepository(7, "example/other")).rejects.toThrow(
      "not in this connection's allowlist"
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects repository path traversal before auditing or calling GitHub", async () => {
    await expect(
      readRepositoryFile(7, "example/repo", "../secret.env")
    ).rejects.toThrow("path is invalid");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("requires a fine-grained token and selected repositories", async () => {
    await expect(
      connectGitHub(7, "ghp_classic_token", ["example/repo"])
    ).rejects.toThrow("fine-grained");
    await expect(
      connectGitHub(7, "github_pat_read_only_test_token", [])
    ).rejects.toThrow("Select at least one repository");
  });

  it("requires production credential encryption and rejects persistence errors", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.INTEGRATION_CREDENTIAL_KEY;
    await expect(
      connectGitHub(7, "github_pat_read_only_test_token", ["example/repo"])
    ).rejects.toThrow("Integration credential encryption is not configured");
    expect(fetch).not.toHaveBeenCalled();

    process.env.INTEGRATION_CREDENTIAL_KEY =
      "test-key-that-is-at-least-thirty-two-characters-long";
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ login: "owner" }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ full_name: "example/repo" }), {
          status: 200,
        })
      );
    queryError = { message: "database unavailable" };
    await expect(
      connectGitHub(7, "github_pat_read_only_test_token", ["example/repo"])
    ).rejects.toThrow("Failed to save GitHub connection");
  });

  it("does not fall back to a process-wide token for another user", async () => {
    process.env.GITHUB_TOKEN = "shared-token-that-must-not-be-used";
    await expect(listRepos(99)).rejects.toThrow("not connected");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("activates the existing owner-managed token through read-only GitHub requests", async () => {
    process.env.GITHUB_TOKEN = "managed-owner-token";
    vi.mocked(mayUseOwnerIntegrationCredentials).mockResolvedValue(true);
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ login: "owner" }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 1,
              name: "quoratorium",
              full_name: "example/quoratorium",
              private: true,
              html_url: "https://github.com/example/quoratorium",
              default_branch: "main",
              updated_at: "2026-09-21T00:00:00Z",
              stargazers_count: 0,
            },
          ]),
          { status: 200 }
        )
      );

    await expect(getSystemGitHubUsername(7)).resolves.toBe("owner");
    await expect(listRepos(7, 20)).resolves.toEqual([
      expect.objectContaining({ fullName: "example/quoratorium" }),
    ]);
    expect(
      vi.mocked(fetch).mock.calls.every(
        ([, options]) => !options?.method || options.method === "GET"
      )
    ).toBe(true);
  });

  it("blocks every phase-one write operation before any GitHub request", async () => {
    await expect(createRepo(7, "new-repo")).rejects.toThrow("read-only");
    await expect(
      createBranch(7, "example/repo", "toriu/change")
    ).rejects.toThrow("read-only");
    await expect(
      pushFiles(
        7,
        "example/repo",
        [{ path: "a.ts", content: "x" }],
        "change",
        "main"
      )
    ).rejects.toThrow("read-only");
    await expect(mergePullRequest(7, "example/repo", 12)).rejects.toThrow(
      "read-only"
    );

    expect(fetch).not.toHaveBeenCalled();
    expect(recordActionAudit).toHaveBeenCalledTimes(4);
    expect(recordActionAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: "github.pull_request.merge",
        outcome: "blocked",
      })
    );
  });
});
