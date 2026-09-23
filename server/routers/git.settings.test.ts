import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";
import * as github from "../githubService";
import { gitRouter } from "./git";

vi.mock("../githubService", () => ({
  getGitHubConnection: vi.fn(),
  getPersonalGitHubCredentialStatus: vi.fn(),
  getSystemGitHubUsername: vi.fn(),
  getSystemGitHubDefaults: vi.fn(),
  connectGitHub: vi.fn(),
  disconnectGitHub: vi.fn(),
  listRepos: vi.fn(),
  createRepo: vi.fn(),
  getCommits: vi.fn(),
  listBranches: vi.fn(),
  createBranch: vi.fn(),
  pushFiles: vi.fn(),
  pullFiles: vi.fn(),
  updateDefaults: vi.fn(),
}));

const context = {
  user: { id: 42 },
} as TrpcContext;

describe("GitHub settings router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(github.getPersonalGitHubCredentialStatus).mockResolvedValue({
      connection: null,
      reconnectRequired: false,
    });
  });

  it("reports a personal connection and its defaults", async () => {
    vi.mocked(github.getPersonalGitHubCredentialStatus).mockResolvedValue({
      connection: {
        username: "octocat",
        default_repo: "octocat/project",
        default_branch: "develop",
      },
      reconnectRequired: false,
    });

    const caller = gitRouter.createCaller(context);
    await expect(caller.status()).resolves.toEqual({
      connected: true,
      username: "octocat",
      defaultRepo: "octocat/project",
      defaultBranch: "develop",
      connectionSource: "personal",
      reconnectRequired: false,
    });
    expect(github.getSystemGitHubUsername).not.toHaveBeenCalled();
  });

  it("reports a workspace connection with saved per-user defaults", async () => {
    vi.mocked(github.getSystemGitHubUsername).mockResolvedValue(
      "workspace-owner"
    );
    vi.mocked(github.getSystemGitHubDefaults).mockResolvedValue({
      defaultRepo: "workspace-owner/project",
      defaultBranch: "main",
    });

    const caller = gitRouter.createCaller(context);
    await expect(caller.status()).resolves.toEqual({
      connected: true,
      username: "workspace-owner",
      defaultRepo: "workspace-owner/project",
      defaultBranch: "main",
      connectionSource: "workspace",
      reconnectRequired: false,
    });
  });

  it("reports a disconnected state when neither connection is available", async () => {
    vi.mocked(github.getSystemGitHubUsername).mockResolvedValue(null);

    const caller = gitRouter.createCaller(context);
    await expect(caller.status()).resolves.toEqual({
      connected: false,
      username: null,
      defaultRepo: null,
      defaultBranch: null,
      connectionSource: null,
      reconnectRequired: false,
    });
  });

  it("reports that an unreadable saved token must be reconnected", async () => {
    vi.mocked(github.getPersonalGitHubCredentialStatus).mockResolvedValue({
      connection: null,
      reconnectRequired: true,
    });
    vi.mocked(github.getSystemGitHubUsername).mockResolvedValue(null);

    const caller = gitRouter.createCaller(context);
    await expect(caller.status()).resolves.toEqual({
      connected: false,
      username: null,
      defaultRepo: null,
      defaultBranch: null,
      connectionSource: null,
      reconnectRequired: true,
    });
  });

  it("persists default repository and branch selections", async () => {
    vi.mocked(github.updateDefaults).mockResolvedValue(true);

    const caller = gitRouter.createCaller(context);
    await expect(
      caller.updateDefaults({
        defaultRepo: "octocat/project",
        defaultBranch: "main",
      })
    ).resolves.toBe(true);
    expect(github.updateDefaults).toHaveBeenCalledWith(
      42,
      "octocat/project",
      "main"
    );
  });
});
