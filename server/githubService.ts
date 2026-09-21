/**
 * GitHub Integration Service (Supabase)
 *
 * Phase 1 is intentionally read-only. The connected credential may only be used
 * to list and inspect repositories, map trees, search code, and read files.
 * Every capability is governed by the Action Catalog and audited. All write
 * entry points are blocked in this service even if the credential itself has
 * broader GitHub permissions.
 */
import crypto from "crypto";
import { getSupabaseAdmin } from "./supabase";
import {
  reconcileIncompleteActionAudits,
  recordActionAudit,
  recordTerminalActionAudit,
} from "./actionAudit";
import {
  assertActionEnabled,
  getActionCatalogEntry,
  GITHUB_ACTION_IDS,
  type GitHubActionId,
} from "@shared/actionCatalog";

const MAX_FILE_BYTES = 256 * 1024;
const MAX_TREE_ENTRIES = 500;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function getDb() {
  return getSupabaseAdmin();
}

function getEncryptionKey(): Buffer {
  const secret = process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new Error(
      "GITHUB_TOKEN_ENCRYPTION_KEY must be configured with at least 32 characters before GitHub can be connected."
    );
  }
  if (/^[a-f0-9]{64}$/i.test(secret)) return Buffer.from(secret, "hex");
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

function encrypt(text: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(text, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    authTag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

function decrypt(encryptedText: string): string {
  const [version, ivValue, tagValue, encryptedValue] = encryptedText.split(":");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) {
    throw new Error(
      "The stored GitHub credential uses an obsolete format. Disconnect and reconnect GitHub."
    );
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivValue, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function assertRepository(repo: string): string {
  const normalized = repo.trim();
  if (!REPOSITORY_PATTERN.test(normalized)) {
    throw new Error("Repository must use the owner/name format.");
  }
  return normalized;
}

function normalizeRepositoryAllowlist(repositories: string[]): string[] {
  const normalized = Array.from(
    new Set(repositories.map(repository => assertRepository(repository)))
  );
  if (normalized.length === 0) {
    throw new Error("Select at least one repository for Toríu to inspect.");
  }
  if (normalized.length > 100) {
    throw new Error("A maximum of 100 repositories may be connected at once.");
  }
  return normalized;
}

function normalizeRepositoryPath(path: string): string {
  const normalized = path.trim().replace(/^\/+/, "").replace(/\\/g, "/");
  const segments = normalized.split("/");
  if (
    !normalized ||
    segments.some(segment => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("Repository file path is invalid.");
  }
  if (normalized.length > 1000)
    throw new Error("Repository file path is too long.");
  return normalized;
}

function encodeRepositoryPath(path: string): string {
  return normalizeRepositoryPath(path)
    .split("/")
    .map(encodeURIComponent)
    .join("/");
}

function errorMessageFromBody(body: string): string {
  try {
    const parsed = JSON.parse(body) as { message?: unknown };
    if (typeof parsed.message === "string") return parsed.message.slice(0, 500);
  } catch {
    // GitHub occasionally returns plain text.
  }
  return body.slice(0, 500) || "Unknown GitHub error";
}

async function githubFetch(
  token: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  const method = (options.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    throw new Error(
      `GitHub ${method} requests are disabled in read-only mode.`
    );
  }
  if (!endpoint.startsWith("/")) {
    throw new Error("GitHub requests must use an approved API path.");
  }
  const url = `https://api.github.com${endpoint}`;
  const res = await fetch(url, {
    ...options,
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `GitHub API error (${res.status}): ${errorMessageFromBody(body)}`
    );
  }
  if (res.status === 204) return null;
  return res.json();
}

async function verifyReadOnlyCredential(
  token: string
): Promise<{ username: string }> {
  if (!token.startsWith("github_pat_")) {
    throw new Error(
      "Use a fine-grained GitHub personal access token limited to selected repositories. Classic and OAuth tokens are not accepted for this connection."
    );
  }
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `GitHub API error (${res.status}): ${errorMessageFromBody(body)}`
    );
  }

  const classicScopes = (res.headers.get("x-oauth-scopes") || "")
    .split(",")
    .map(scope => scope.trim())
    .filter(Boolean);
  const writeScopes = classicScopes.filter(
    scope =>
      scope === "repo" ||
      scope === "public_repo" ||
      scope === "workflow" ||
      scope === "delete_repo" ||
      scope.startsWith("write:") ||
      scope.startsWith("admin:")
  );
  if (writeScopes.length > 0) {
    throw new Error(
      "This token grants GitHub write access. Connect a fine-grained token limited to the selected repositories with Contents: Read-only and Metadata: Read-only."
    );
  }

  const user = (await res.json()) as { login?: unknown };
  if (typeof user.login !== "string" || !user.login) {
    throw new Error("GitHub did not return a valid account username.");
  }
  return { username: user.login };
}

export async function connectGitHub(
  userId: number,
  token: string,
  repositories: string[]
): Promise<{
  username: string;
  mode: "read-only";
  repositories: string[];
}> {
  const normalizedToken = token.trim();
  if (!normalizedToken) throw new Error("GitHub token is required.");
  const allowedRepositories = normalizeRepositoryAllowlist(repositories);
  getEncryptionKey();
  const { username } = await auditedRead({
    userId,
    actionId: GITHUB_ACTION_IDS.verifyConnection,
    target: "github-account",
    details: { step: "account" },
    operation: () => verifyReadOnlyCredential(normalizedToken),
  });
  for (const repository of allowedRepositories) {
    await auditedRead({
      userId,
      actionId: GITHUB_ACTION_IDS.verifyConnection,
      target: repository,
      details: { step: "repository-access" },
      operation: () => githubFetch(normalizedToken, `/repos/${repository}`),
    });
  }

  const db = getDb();
  if (!db) throw new Error("Database not available");
  const { error } = await db.from("github_connections").upsert(
    {
      user_id: userId,
      token_encrypted: encrypt(normalizedToken),
      username,
      allowed_repositories: allowedRepositories,
      default_repo: allowedRepositories[0],
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) {
    throw new Error(`Failed to save GitHub connection: ${error.message}`);
  }

  return { username, mode: "read-only", repositories: allowedRepositories };
}

export async function disconnectGitHub(userId: number): Promise<boolean> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const { error } = await db
    .from("github_connections")
    .delete()
    .eq("user_id", userId);
  if (error) throw new Error(`Failed to disconnect GitHub: ${error.message}`);
  return true;
}

export async function getGitHubConnection(userId: number) {
  const db = getDb();
  if (!db) return null;
  const { data, error } = await db
    .from("github_connections")
    .select("*")
    .eq("user_id", userId)
    .limit(1)
    .single();
  if (error && error.code !== "PGRST116") {
    throw new Error(`Failed to load GitHub connection: ${error.message}`);
  }
  return data || null;
}

async function getGitHubAccess(
  userId: number,
  repository?: string
): Promise<{ token: string; allowedRepositories: string[] }> {
  const conn = await getGitHubConnection(userId);
  if (!conn) {
    throw new Error(
      "GitHub is not connected. Add a read-only token in Settings."
    );
  }
  const allowedRepositories: string[] = Array.isArray(conn.allowed_repositories)
    ? conn.allowed_repositories
        .filter((value: unknown): value is string => typeof value === "string")
        .map(assertRepository)
    : [];
  if (allowedRepositories.length === 0) {
    throw new Error(
      "No repositories are authorized. Disconnect and reconnect GitHub with an explicit repository list."
    );
  }
  if (
    repository &&
    !allowedRepositories.some(
      allowed => allowed.toLowerCase() === repository.toLowerCase()
    )
  ) {
    throw new Error(
      `Repository ${repository} is not in this connection's allowlist.`
    );
  }
  return {
    token: decrypt(conn.token_encrypted),
    allowedRepositories,
  };
}

async function auditedRead<T>(input: {
  userId: number;
  actionId: GitHubActionId;
  target?: string;
  details?: Record<string, unknown>;
  operation: () => Promise<T>;
}): Promise<T> {
  const action = assertActionEnabled(input.actionId);
  await reconcileIncompleteActionAudits(input.userId);
  const intent = await recordActionAudit({
    actionId: input.actionId,
    userId: input.userId,
    target: input.target,
    outcome: "allowed",
    riskLevel: action.riskLevel,
    confirmationRule: action.confirmationRule,
    details: input.details,
  });
  let result: T;
  try {
    result = await input.operation();
  } catch (error: any) {
    await recordTerminalActionAudit({
      intentId: intent.id!,
      actionId: input.actionId,
      userId: input.userId,
      target: input.target,
      outcome: "failed",
      riskLevel: action.riskLevel,
      confirmationRule: action.confirmationRule,
      details: {
        ...input.details,
        error: String(error?.message || "unknown").slice(0, 300),
      },
    });
    throw error;
  }
  await recordTerminalActionAudit({
    intentId: intent.id!,
    actionId: input.actionId,
    userId: input.userId,
    target: input.target,
    outcome: "succeeded",
    riskLevel: action.riskLevel,
    confirmationRule: action.confirmationRule,
    details: input.details,
  });
  return result;
}

async function blockWrite(
  userId: number,
  actionId: GitHubActionId,
  target?: string
): Promise<never> {
  const action = getActionCatalogEntry(actionId);
  await recordActionAudit({
    actionId,
    userId,
    target,
    outcome: "blocked",
    riskLevel: action.riskLevel,
    confirmationRule: action.confirmationRule,
    details: { reason: "phase_1_read_only_policy" },
  });
  assertActionEnabled(actionId);
  throw new Error(`${action.label} is not implemented in read-only mode.`);
}

export interface GitHubRepositorySummary {
  id: number;
  name: string;
  fullName: string;
  full_name: string;
  description: string | null;
  private: boolean;
  url: string;
  defaultBranch: string;
  language: string | null;
  updatedAt: string;
  stars: number;
  visibility: string;
  archived: boolean;
  permission: "admin" | "write" | "read" | "none";
}

function repositoryPermission(
  repository: any
): GitHubRepositorySummary["permission"] {
  if (repository.permissions?.admin) return "admin";
  if (repository.permissions?.push) return "write";
  if (repository.permissions?.pull) return "read";
  return "none";
}

export async function listRepos(
  userId: number,
  limit = 100
): Promise<GitHubRepositorySummary[]> {
  return auditedRead({
    userId,
    actionId: GITHUB_ACTION_IDS.listRepositories,
    details: { limit },
    operation: async () => {
      const { token, allowedRepositories } = await getGitHubAccess(userId);
      const perPage = Math.max(1, Math.min(limit, 100));
      const repos = await Promise.all(
        allowedRepositories
          .slice(0, perPage)
          .map(repository => githubFetch(token, `/repos/${repository}`))
      );
      return repos.map((r: any) => ({
        id: r.id,
        name: r.name,
        fullName: r.full_name,
        full_name: r.full_name,
        description: r.description,
        private: r.private,
        url: r.html_url,
        defaultBranch: r.default_branch,
        language: r.language,
        updatedAt: r.updated_at,
        stars: r.stargazers_count,
        visibility: r.visibility,
        archived: Boolean(r.archived),
        permission: repositoryPermission(r),
      }));
    },
  });
}

export async function getRepository(
  userId: number,
  repo: string
): Promise<Record<string, unknown>> {
  const normalizedRepo = assertRepository(repo);
  return auditedRead({
    userId,
    actionId: GITHUB_ACTION_IDS.inspectRepository,
    target: normalizedRepo,
    operation: async () => {
      const { token } = await getGitHubAccess(userId, normalizedRepo);
      const repository = await githubFetch(token, `/repos/${normalizedRepo}`);
      const languages = await githubFetch(
        token,
        `/repos/${normalizedRepo}/languages`
      );
      return {
        id: repository.id,
        name: repository.name,
        fullName: repository.full_name,
        description: repository.description,
        private: repository.private,
        visibility: repository.visibility,
        archived: repository.archived,
        disabled: repository.disabled,
        fork: repository.fork,
        defaultBranch: repository.default_branch,
        language: repository.language,
        languages,
        sizeKb: repository.size,
        openIssues: repository.open_issues_count,
        topics: repository.topics || [],
        license: repository.license?.spdx_id || null,
        updatedAt: repository.updated_at,
        pushedAt: repository.pushed_at,
        url: repository.html_url,
        permission: repositoryPermission(repository),
      };
    },
  });
}

export async function getCommits(
  userId: number,
  repo: string,
  branch?: string
): Promise<any[]> {
  const normalizedRepo = assertRepository(repo);
  return auditedRead({
    userId,
    actionId: GITHUB_ACTION_IDS.listCommits,
    target: normalizedRepo,
    details: branch ? { branch } : undefined,
    operation: async () => {
      const { token } = await getGitHubAccess(userId, normalizedRepo);
      const endpoint = `/repos/${normalizedRepo}/commits?per_page=20${branch ? `&sha=${encodeURIComponent(branch)}` : ""}`;
      const commits = await githubFetch(token, endpoint);
      return commits.map((c: any) => ({
        sha: c.sha.slice(0, 7),
        fullSha: c.sha,
        message: c.commit.message,
        author: c.commit.author?.name || c.author?.login || "Unknown",
        date: c.commit.author?.date || c.commit.committer?.date,
        url: c.html_url,
      }));
    },
  });
}

export async function listBranches(
  userId: number,
  repo: string
): Promise<any[]> {
  const normalizedRepo = assertRepository(repo);
  return auditedRead({
    userId,
    actionId: GITHUB_ACTION_IDS.listBranches,
    target: normalizedRepo,
    operation: async () => {
      const { token } = await getGitHubAccess(userId, normalizedRepo);
      const branches = await githubFetch(
        token,
        `/repos/${normalizedRepo}/branches?per_page=100`
      );
      return branches.map((b: any) => ({
        name: b.name,
        sha: b.commit.sha.slice(0, 7),
        fullSha: b.commit.sha,
        protected: Boolean(b.protected),
      }));
    },
  });
}

export interface GitHubTreeEntry {
  path: string;
  type: "blob" | "tree";
  sha: string;
  size: number | null;
}

export async function listRepositoryTree(
  userId: number,
  repo: string,
  ref?: string,
  pathPrefix?: string,
  limit = MAX_TREE_ENTRIES
): Promise<{ ref: string; truncated: boolean; entries: GitHubTreeEntry[] }> {
  const normalizedRepo = assertRepository(repo);
  const normalizedPrefix = pathPrefix?.trim().replace(/^\/+|\/+$/g, "") || "";
  return auditedRead({
    userId,
    actionId: GITHUB_ACTION_IDS.listTree,
    target: normalizedRepo,
    details: {
      ref: ref || "default",
      pathPrefix: normalizedPrefix || undefined,
      limit,
    },
    operation: async () => {
      const { token } = await getGitHubAccess(userId, normalizedRepo);
      let selectedRef = ref?.trim();
      if (!selectedRef) {
        const repository = await githubFetch(token, `/repos/${normalizedRepo}`);
        selectedRef = repository.default_branch;
      }
      if (!selectedRef) throw new Error("Repository has no default branch.");

      const tree = await githubFetch(
        token,
        `/repos/${normalizedRepo}/git/trees/${encodeURIComponent(selectedRef)}?recursive=1`
      );
      const maxEntries = Math.max(1, Math.min(limit, MAX_TREE_ENTRIES));
      const entries = (Array.isArray(tree.tree) ? tree.tree : [])
        .filter((item: any) => item.type === "blob" || item.type === "tree")
        .filter(
          (item: any) =>
            !normalizedPrefix ||
            item.path === normalizedPrefix ||
            item.path.startsWith(`${normalizedPrefix}/`)
        )
        .slice(0, maxEntries)
        .map((item: any) => ({
          path: item.path,
          type: item.type,
          sha: item.sha,
          size: typeof item.size === "number" ? item.size : null,
        }));
      return {
        ref: selectedRef,
        truncated: Boolean(tree.truncated) || entries.length >= maxEntries,
        entries,
      };
    },
  });
}

export async function readRepositoryFile(
  userId: number,
  repo: string,
  path: string,
  ref?: string
): Promise<{
  path: string;
  ref: string;
  sha: string;
  size: number;
  content: string;
  url: string;
}> {
  const normalizedRepo = assertRepository(repo);
  const normalizedPath = normalizeRepositoryPath(path);
  return auditedRead({
    userId,
    actionId: GITHUB_ACTION_IDS.readFile,
    target: `${normalizedRepo}:${normalizedPath}`,
    details: { ref: ref || "default" },
    operation: async () => {
      const { token } = await getGitHubAccess(userId, normalizedRepo);
      let selectedRef = ref?.trim();
      if (!selectedRef) {
        const repository = await githubFetch(token, `/repos/${normalizedRepo}`);
        selectedRef = repository.default_branch;
      }
      if (!selectedRef) throw new Error("Repository has no default branch.");

      const file = await githubFetch(
        token,
        `/repos/${normalizedRepo}/contents/${encodeRepositoryPath(normalizedPath)}?ref=${encodeURIComponent(selectedRef)}`
      );
      if (Array.isArray(file) || file?.type !== "file") {
        throw new Error("The requested path is not a file.");
      }
      if (typeof file.size !== "number" || file.size > MAX_FILE_BYTES) {
        throw new Error(
          `File is larger than the ${MAX_FILE_BYTES / 1024} KB read-only limit.`
        );
      }
      if (file.encoding !== "base64" || typeof file.content !== "string") {
        throw new Error("GitHub did not return readable file content.");
      }
      const content = Buffer.from(
        file.content.replace(/\n/g, ""),
        "base64"
      ).toString("utf8");
      if (content.includes("\u0000"))
        throw new Error("Binary files cannot be read as source text.");
      return {
        path: normalizedPath,
        ref: selectedRef,
        sha: file.sha,
        size: file.size,
        content,
        url: file.html_url,
      };
    },
  });
}

export async function searchRepositoryCode(
  userId: number,
  repo: string,
  query: string,
  limit = 20
): Promise<
  Array<{
    path: string;
    name: string;
    sha: string;
    url: string;
    fragments: string[];
  }>
> {
  const normalizedRepo = assertRepository(repo);
  const normalizedQuery = query
    .trim()
    .replace(/[\r\n]+/g, " ")
    .slice(0, 200);
  if (!normalizedQuery) throw new Error("Code search query is required.");
  return auditedRead({
    userId,
    actionId: GITHUB_ACTION_IDS.searchCode,
    target: normalizedRepo,
    details: { query: normalizedQuery, limit },
    operation: async () => {
      const { token } = await getGitHubAccess(userId, normalizedRepo);
      const perPage = Math.max(1, Math.min(limit, 50));
      const q = encodeURIComponent(`${normalizedQuery} repo:${normalizedRepo}`);
      const result = await githubFetch(
        token,
        `/search/code?q=${q}&per_page=${perPage}`,
        {
          headers: { Accept: "application/vnd.github.text-match+json" },
        }
      );
      return (result.items || []).map((item: any) => ({
        path: item.path,
        name: item.name,
        sha: item.sha,
        url: item.html_url,
        fragments: Array.isArray(item.text_matches)
          ? item.text_matches
              .map((match: any) => String(match.fragment || "").slice(0, 1000))
              .filter(Boolean)
          : [],
      }));
    },
  });
}

/**
 * Compatibility helper for existing clients. It remains a bounded read and no
 * longer attempts to mirror an arbitrary repository into memory.
 */
export async function pullFiles(
  userId: number,
  repo: string,
  branch?: string
): Promise<{ path: string; content: string }[]> {
  const tree = await listRepositoryTree(userId, repo, branch, undefined, 50);
  const sourceFiles = tree.entries
    .filter(entry => entry.type === "blob" && (entry.size || 0) <= 100_000)
    .slice(0, 25);
  const files: { path: string; content: string }[] = [];
  for (const entry of sourceFiles) {
    try {
      const file = await readRepositoryFile(userId, repo, entry.path, tree.ref);
      files.push({ path: file.path, content: file.content });
    } catch {
      // Skip binary and otherwise unreadable files.
    }
  }
  return files;
}

// ─── Phase-one write barriers ────────────────────────────────────────────────

export async function createRepo(
  userId: number,
  name: string,
  _description?: string,
  _isPrivate = true
): Promise<never> {
  return blockWrite(userId, GITHUB_ACTION_IDS.createRepository, name);
}

export async function createBranch(
  userId: number,
  repo: string,
  branchName: string,
  _fromBranch?: string
): Promise<never> {
  return blockWrite(
    userId,
    GITHUB_ACTION_IDS.createBranch,
    `${repo}:${branchName}`
  );
}

export async function pushFiles(
  userId: number,
  repo: string,
  _files: { path: string; content: string }[],
  _commitMessage: string,
  branch = "main"
): Promise<never> {
  return blockWrite(userId, GITHUB_ACTION_IDS.commitFiles, `${repo}:${branch}`);
}

export async function mergePullRequest(
  userId: number,
  repo: string,
  pullNumber: number
): Promise<never> {
  return blockWrite(
    userId,
    GITHUB_ACTION_IDS.mergePullRequest,
    `${repo}#${pullNumber}`
  );
}

export async function updateDefaults(
  userId: number,
  defaultRepo?: string,
  defaultBranch?: string
): Promise<boolean> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const updates: Record<string, string> = {};
  if (defaultRepo !== undefined) {
    const normalizedRepo = assertRepository(defaultRepo);
    await getGitHubAccess(userId, normalizedRepo);
    updates.default_repo = normalizedRepo;
  }
  if (defaultBranch !== undefined)
    updates.default_branch = defaultBranch.trim();
  if (Object.keys(updates).length === 0) return false;
  const { error } = await db
    .from("github_connections")
    .update(updates)
    .eq("user_id", userId);
  if (error)
    throw new Error(`Failed to update GitHub defaults: ${error.message}`);
  return true;
}
