export type ActionRiskLevel = "none" | "low" | "medium" | "high" | "critical";
export type ActionConfirmationRule = "none" | "review" | "explicit" | "never";
export type ActionExecutionMode = "read" | "propose" | "write" | "prohibited";

export interface ActionCatalogEntry {
  id: string;
  app: string;
  label: string;
  capability: string;
  permissions: string[];
  mode: ActionExecutionMode;
  riskLevel: ActionRiskLevel;
  confirmationRule: ActionConfirmationRule;
  enabled: boolean;
  audit: boolean;
}

export const GITHUB_ACTION_IDS = {
  verifyConnection: "github.connection.verify",
  listRepositories: "github.repository.list",
  inspectRepository: "github.repository.inspect",
  listTree: "github.repository.tree",
  readFile: "github.repository.file.read",
  searchCode: "github.repository.code.search",
  listBranches: "github.repository.branches.list",
  listCommits: "github.repository.commits.list",
  createRepository: "github.repository.create",
  createBranch: "github.branch.create",
  commitFiles: "github.commit.create",
  openPullRequest: "github.pull_request.create",
  mergePullRequest: "github.pull_request.merge",
} as const;

export type GitHubActionId =
  (typeof GITHUB_ACTION_IDS)[keyof typeof GITHUB_ACTION_IDS];

const GITHUB_ACTION_CATALOG: Record<GitHubActionId, ActionCatalogEntry> = {
  [GITHUB_ACTION_IDS.verifyConnection]: {
    id: GITHUB_ACTION_IDS.verifyConnection,
    app: "github",
    label: "Verify GitHub connection",
    capability:
      "Verify the signed-in account and selected repository access before storing an encrypted connection.",
    permissions: ["metadata:read", "contents:read"],
    mode: "read",
    riskLevel: "low",
    confirmationRule: "explicit",
    enabled: true,
    audit: true,
  },
  [GITHUB_ACTION_IDS.listRepositories]: {
    id: GITHUB_ACTION_IDS.listRepositories,
    app: "github",
    label: "List repositories",
    capability:
      "See repositories available through the connected GitHub credential.",
    permissions: ["metadata:read"],
    mode: "read",
    riskLevel: "none",
    confirmationRule: "none",
    enabled: true,
    audit: true,
  },
  [GITHUB_ACTION_IDS.inspectRepository]: {
    id: GITHUB_ACTION_IDS.inspectRepository,
    app: "github",
    label: "Inspect repository",
    capability:
      "Read repository metadata and identify its default branch and language mix.",
    permissions: ["metadata:read", "contents:read"],
    mode: "read",
    riskLevel: "none",
    confirmationRule: "none",
    enabled: true,
    audit: true,
  },
  [GITHUB_ACTION_IDS.listTree]: {
    id: GITHUB_ACTION_IDS.listTree,
    app: "github",
    label: "Map repository files",
    capability:
      "Read a repository tree so Toríu can locate code and explain its structure.",
    permissions: ["contents:read"],
    mode: "read",
    riskLevel: "none",
    confirmationRule: "none",
    enabled: true,
    audit: true,
  },
  [GITHUB_ACTION_IDS.readFile]: {
    id: GITHUB_ACTION_IDS.readFile,
    app: "github",
    label: "Read repository file",
    capability: "Read the text content of a specific file without changing it.",
    permissions: ["contents:read"],
    mode: "read",
    riskLevel: "none",
    confirmationRule: "none",
    enabled: true,
    audit: true,
  },
  [GITHUB_ACTION_IDS.searchCode]: {
    id: GITHUB_ACTION_IDS.searchCode,
    app: "github",
    label: "Search repository code",
    capability: "Search paths and code in one connected repository.",
    permissions: ["metadata:read", "contents:read"],
    mode: "read",
    riskLevel: "none",
    confirmationRule: "none",
    enabled: true,
    audit: true,
  },
  [GITHUB_ACTION_IDS.listBranches]: {
    id: GITHUB_ACTION_IDS.listBranches,
    app: "github",
    label: "List branches",
    capability: "Read branch names, commit references, and protection state.",
    permissions: ["contents:read"],
    mode: "read",
    riskLevel: "none",
    confirmationRule: "none",
    enabled: true,
    audit: true,
  },
  [GITHUB_ACTION_IDS.listCommits]: {
    id: GITHUB_ACTION_IDS.listCommits,
    app: "github",
    label: "List commits",
    capability: "Read recent commit history for repository context.",
    permissions: ["contents:read"],
    mode: "read",
    riskLevel: "none",
    confirmationRule: "none",
    enabled: true,
    audit: true,
  },
  [GITHUB_ACTION_IDS.createRepository]: {
    id: GITHUB_ACTION_IDS.createRepository,
    app: "github",
    label: "Create repository",
    capability: "Create a repository in GitHub.",
    permissions: ["administration:write"],
    mode: "write",
    riskLevel: "high",
    confirmationRule: "explicit",
    enabled: false,
    audit: true,
  },
  [GITHUB_ACTION_IDS.createBranch]: {
    id: GITHUB_ACTION_IDS.createBranch,
    app: "github",
    label: "Create working branch",
    capability:
      "Create an isolated branch after a proposed change has been reviewed.",
    permissions: ["contents:write"],
    mode: "write",
    riskLevel: "low",
    confirmationRule: "review",
    enabled: false,
    audit: true,
  },
  [GITHUB_ACTION_IDS.commitFiles]: {
    id: GITHUB_ACTION_IDS.commitFiles,
    app: "github",
    label: "Commit files to working branch",
    capability: "Commit an approved change to an isolated Toríu branch only.",
    permissions: ["contents:write"],
    mode: "write",
    riskLevel: "medium",
    confirmationRule: "review",
    enabled: false,
    audit: true,
  },
  [GITHUB_ACTION_IDS.openPullRequest]: {
    id: GITHUB_ACTION_IDS.openPullRequest,
    app: "github",
    label: "Open pull request",
    capability:
      "Open a reviewable pull request from a Toríu branch; never merge it.",
    permissions: ["contents:write", "pull_requests:write"],
    mode: "propose",
    riskLevel: "medium",
    confirmationRule: "explicit",
    enabled: false,
    audit: true,
  },
  [GITHUB_ACTION_IDS.mergePullRequest]: {
    id: GITHUB_ACTION_IDS.mergePullRequest,
    app: "github",
    label: "Merge pull request",
    capability: "Merge a pull request into a protected branch.",
    permissions: ["contents:write", "pull_requests:write"],
    mode: "prohibited",
    riskLevel: "critical",
    confirmationRule: "never",
    enabled: false,
    audit: true,
  },
};

export function getGitHubActionCatalog(): ActionCatalogEntry[] {
  return Object.values(GITHUB_ACTION_CATALOG).map(entry => ({
    ...entry,
    permissions: [...entry.permissions],
  }));
}

export function getActionCatalogEntry(id: GitHubActionId): ActionCatalogEntry {
  return GITHUB_ACTION_CATALOG[id];
}

export function assertActionEnabled(id: GitHubActionId): ActionCatalogEntry {
  const entry = getActionCatalogEntry(id);
  if (!entry.enabled) {
    throw new Error(
      `${entry.label} is disabled by Toríu's Action Catalog. GitHub is currently read-only; the next write phase will be propose → branch → pull request, with no merge capability.`
    );
  }
  return entry;
}
