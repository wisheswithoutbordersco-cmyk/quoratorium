import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  addOrchestrationEvent: vi.fn(),
  createPullRequestFromProposal: vi.fn(),
}));

vi.mock("./supabase", () => ({
  getSupabaseAdmin: () => ({ from: mocks.from }),
}));
vi.mock("./db", () => ({
  addOrchestrationEvent: mocks.addOrchestrationEvent,
}));
vi.mock("./githubService", () => ({
  createPullRequestFromProposal: mocks.createPullRequestFromProposal,
}));

import {
  createGitHubProposal,
  executeApprovedGitHubProposal,
  type GitHubChangeProposal,
} from "./githubProposalService";

function terminalChain(result: { data: unknown; error: unknown }) {
  const chain: any = {};
  chain.eq = vi.fn(() => chain);
  chain.select = vi.fn(() => chain);
  chain.single = vi.fn(async () => result);
  return chain;
}

function proposal(
  overrides: Partial<GitHubChangeProposal> = {}
): GitHubChangeProposal {
  return {
    id: "6f5f3130-464b-4cd7-8e26-f94a936d1204",
    user_id: 7,
    project_id: null,
    repository: "example/repo",
    base_branch: "main",
    branch_name: "toriu/fix-settings-a1b2c3",
    title: "Fix settings controls",
    body: "Makes settings actionable.",
    commit_message: "fix: make settings actionable",
    files: [
      {
        path: "client/settings.tsx",
        content: "export const enabled = true;\n",
      },
    ],
    status: "proposed",
    risk_level: "high",
    confirmation_rule: "always_confirm",
    approved_at: null,
    executed_at: null,
    pull_request_number: null,
    pull_request_url: null,
    error: null,
    created_at: "2026-09-21T00:00:00.000Z",
    updated_at: "2026-09-21T00:00:00.000Z",
    ...overrides,
  };
}

describe("GitHub proposal workflow", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.addOrchestrationEvent.mockReset();
    mocks.createPullRequestFromProposal.mockReset();
  });

  it("stores an internal proposal and performs no GitHub operation", async () => {
    const inserted = proposal();
    const single = vi.fn(async () => ({ data: inserted, error: null }));
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    mocks.from.mockReturnValue({ insert });

    const result = await createGitHubProposal({
      userId: 7,
      repository: "example/repo",
      baseBranch: "main",
      branchSlug: "fix settings",
      title: "Fix settings controls",
      body: "Makes settings actionable.",
      commitMessage: "fix: make settings actionable",
      files: inserted.files,
    });

    expect(result).toEqual(inserted);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        repository: "example/repo",
        status: "proposed",
        risk_level: "high",
        confirmation_rule: "always_confirm",
      })
    );
    expect(mocks.createPullRequestFromProposal).not.toHaveBeenCalled();
    expect(mocks.addOrchestrationEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: "github_change_proposed" })
    );
  });

  it("claims a proposed action once, records approval, and stores the draft pull request", async () => {
    const claimed = proposal({
      status: "executing",
      approved_at: "2026-09-21T00:01:00.000Z",
    });
    const completed = proposal({
      status: "pull_request_opened",
      approved_at: claimed.approved_at,
      executed_at: "2026-09-21T00:02:00.000Z",
      pull_request_number: 42,
      pull_request_url: "https://github.com/example/repo/pull/42",
    });
    const claimChain = terminalChain({ data: claimed, error: null });
    const completeChain = terminalChain({ data: completed, error: null });
    mocks.from
      .mockReturnValueOnce({ update: vi.fn(() => claimChain) })
      .mockReturnValueOnce({ update: vi.fn(() => completeChain) });
    mocks.createPullRequestFromProposal.mockResolvedValue({
      number: 42,
      url: "https://github.com/example/repo/pull/42",
      commitSha: "proposal-commit-sha",
    });

    const result = await executeApprovedGitHubProposal(7, claimed.id);

    expect(result.status).toBe("pull_request_opened");
    expect(result.pull_request_number).toBe(42);
    expect(claimChain.eq).toHaveBeenCalledWith("status", "proposed");
    expect(mocks.createPullRequestFromProposal).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        repository: "example/repo",
        branchName: "toriu/fix-settings-a1b2c3",
      })
    );
    expect(mocks.addOrchestrationEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ event_type: "github_pull_request_approved" })
    );
    expect(mocks.addOrchestrationEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ event_type: "github_pull_request_opened" })
    );
  });
});
