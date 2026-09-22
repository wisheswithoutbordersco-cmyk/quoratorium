import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetBusinessActionAuthForTests,
  startBusinessActionSession,
} from "../businessActionAuth";
import type { TrpcContext } from "../_core/context";
import type { User } from "../db";

const mocks = vi.hoisted(() => ({
  executeApprovedGitHubProposal: vi.fn(),
  listGitHubProposals: vi.fn(),
  getGitHubProposal: vi.fn(),
  cancelGitHubProposal: vi.fn(),
}));

vi.mock("../githubProposalService", () => mocks);
vi.mock("../githubService", () => ({
  getGitHubConnection: vi.fn(),
  getSystemGitHubUsername: vi.fn(),
  getSystemGitHubDefaults: vi.fn(),
  connectGitHub: vi.fn(),
  disconnectGitHub: vi.fn(),
  listRepos: vi.fn(),
  getCommits: vi.fn(),
  listBranches: vi.fn(),
  getRepositoryOverview: vi.fn(),
  getRepositoryTree: vi.fn(),
  readRepositoryFile: vi.fn(),
  searchRepositoryCode: vi.fn(),
  updateDefaults: vi.fn(),
}));

import { gitRouter } from "./git";

const owner: User = {
  id: 1,
  clerk_id: "owner_workspace",
  name: "Owner",
  email: null,
  login_method: "owner_access",
  role: "admin",
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
  last_signed_in: new Date(0).toISOString(),
};

function actionCookie(): string {
  const res = { cookie: vi.fn(), clearCookie: vi.fn() } as any;
  startBusinessActionSession(res, owner.id);
  const [name, value] = res.cookie.mock.calls[0];
  return `${name}=${encodeURIComponent(value)}`;
}

function caller(cookie = "") {
  const ctx: TrpcContext = {
    req: {
      headers: { cookie },
      socket: { remoteAddress: "127.0.0.1" },
      ip: "127.0.0.1",
    } as any,
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as any,
    user: owner,
    isOwner: true,
    authenticatedUser: owner,
    isVerifiedOwner: true,
  };
  return gitRouter.createCaller(ctx);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetBusinessActionAuthForTests();
  process.env.BUSINESS_ACTION_PIN = "correct-horse-47";
  process.env.BUSINESS_ACTION_SESSION_SECRET =
    "test-session-secret-with-entropy";
  mocks.executeApprovedGitHubProposal.mockResolvedValue({
    id: "6f5f3130-464b-4cd7-8e26-f94a936d1204",
    status: "pull_request_opened",
    pull_request_number: 42,
    pull_request_url: "https://github.com/example/repo/pull/42",
  });
});

describe("GitHub proposal router", () => {
  const input = {
    id: "6f5f3130-464b-4cd7-8e26-f94a936d1204",
    confirmation: "OPEN_PULL_REQUEST" as const,
  };

  it("rejects pull-request execution while owner actions are locked", async () => {
    await expect(caller().openPullRequest(input)).rejects.toThrow(
      "Unlock business actions"
    );
    expect(mocks.executeApprovedGitHubProposal).not.toHaveBeenCalled();
  });

  it("executes the exact proposal only after a verified owner-action session", async () => {
    const result = await caller(actionCookie()).openPullRequest(input);
    expect(result).toMatchObject({
      status: "pull_request_opened",
      pull_request_number: 42,
    });
    expect(mocks.executeApprovedGitHubProposal).toHaveBeenCalledWith(
      1,
      input.id
    );
  });

  it("rejects any confirmation value other than the exact required phrase", async () => {
    await expect(
      (caller(actionCookie()).openPullRequest as any)({
        ...input,
        confirmation: "YES",
      })
    ).rejects.toThrow();
    expect(mocks.executeApprovedGitHubProposal).not.toHaveBeenCalled();
  });

  it("exposes no merge procedure", async () => {
    await expect(
      (caller(actionCookie()) as any).mergePullRequest({})
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
