/**
 * GitHub Integration Service (Supabase)
 * Handles: token encryption, repo operations, push/pull, commits, branches
 */
import { getSupabaseAdmin } from "./supabase";
import { addOrchestrationEvent } from "./db";
import {
  decryptProviderCredential,
  encryptProviderCredential,
  isProviderCredentialError,
} from "./providerCredentialCrypto";

function getDb() {
  return getSupabaseAdmin();
}

const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const MAX_READ_FILE_BYTES = 200_000;

function validateRepository(repo: string): string {
  const normalized = repo.trim();
  if (!REPOSITORY_PATTERN.test(normalized)) {
    throw new Error("Repository must be in owner/repository format.");
  }
  return normalized;
}

function validateReference(ref?: string): string | undefined {
  if (!ref) return undefined;
  const normalized = ref.trim();
  if (
    !normalized ||
    normalized.length > 255 ||
    normalized.includes("..") ||
    normalized.includes("@{") ||
    /[~^:?*\\[\\]\\\x00-\x1f\x7f]/.test(normalized)
  ) {
    throw new Error("The requested Git reference is invalid.");
  }
  return normalized;
}

function validateRepositoryPath(path: string): string {
  const normalized = path.trim().replace(/^\/+/, "");
  if (
    !normalized ||
    normalized.length > 1024 ||
    normalized.includes("\\") ||
    normalized.split("/").some(part => !part || part === "." || part === "..")
  ) {
    throw new Error("The requested repository path is invalid.");
  }
  return normalized;
}

function repositoryEndpoint(repo: string): string {
  const [owner, name] = validateRepository(repo).split("/");
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
}

function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

// ─── GitHub API Helpers ───────────────────────────────────────────────────────

async function githubFetch(
  token: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  const url = endpoint.startsWith("http")
    ? endpoint
    : `https://api.github.com${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`GitHub API error (${res.status}): ${error}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function auditGitHubCapability(params: {
  userId: number;
  action: string;
  repository?: string;
  reference?: string;
  path?: string;
  query?: string;
  resultCount?: number;
  projectId?: number | null;
}): Promise<void> {
  try {
    await addOrchestrationEvent({
      user_id: params.userId,
      project_id: params.projectId || null,
      event_type: "github_read",
      agent_name: "Toríu · GitHub",
      summary: `${params.action}${params.repository ? ` · ${params.repository}` : ""}`,
      payload: {
        capability: "github.repository.read",
        permission: "read",
        risk: "low",
        confirmation: "none",
        action: params.action,
        repository: params.repository,
        reference: params.reference,
        path: params.path,
        query: params.query ? truncateText(params.query, 160) : undefined,
        resultCount: params.resultCount,
      },
    });
  } catch (error: any) {
    // Audit storage must not turn a successful read into a user-facing failure.
    console.warn(
      "[GitHub] Failed to record read audit:",
      error?.message || error
    );
  }
}

// ─── Connection Management ────────────────────────────────────────────────────

export async function connectGitHub(
  userId: number,
  token: string
): Promise<{ username: string }> {
  const user = await githubFetch(token, "/user");
  const username = user.login;

  const db = getDb();
  if (!db) throw new Error("Database not available");

  const { data: existing } = await db
    .from("github_connections")
    .select("id")
    .eq("user_id", userId)
    .limit(1);

  if (existing && existing.length > 0) {
    await db
      .from("github_connections")
      .update({
        token_encrypted: encryptProviderCredential(token, "github"),
        username,
      })
      .eq("user_id", userId);
  } else {
    await db.from("github_connections").insert({
      user_id: userId,
      token_encrypted: encryptProviderCredential(token, "github"),
      username,
    });
  }

  return { username };
}

export async function disconnectGitHub(userId: number): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  await db.from("github_connections").delete().eq("user_id", userId);
  return true;
}

export async function getGitHubConnection(userId: number) {
  const db = getDb();
  if (!db) return null;
  const { data } = await db
    .from("github_connections")
    .select("*")
    .eq("user_id", userId)
    .limit(1)
    .single();
  return data || null;
}

async function decryptGitHubToken(connection: any): Promise<string> {
  const decrypted = decryptProviderCredential(
    connection.token_encrypted,
    "github"
  );
  if (decrypted.needsRotation) {
    const db = getDb();
    const { error } = db
      ? await db
          .from("github_connections")
          .update({
            token_encrypted: encryptProviderCredential(
              decrypted.value,
              "github"
            ),
          })
          .eq("id", connection.id)
      : { error: null };
    if (error) {
      console.warn(
        "[GitHub] Credential worked but could not be rotated:",
        error.message
      );
    }
  }
  return decrypted.value;
}

export async function getPersonalGitHubCredentialStatus(
  userId: number
): Promise<{ connection: any | null; reconnectRequired: boolean }> {
  const connection = await getGitHubConnection(userId);
  if (!connection) return { connection: null, reconnectRequired: false };
  try {
    await decryptGitHubToken(connection);
    return { connection, reconnectRequired: false };
  } catch (error) {
    if (!isProviderCredentialError(error)) throw error;
    console.warn("[GitHub] Saved credential needs reconnection:", error.message);
    return { connection: null, reconnectRequired: true };
  }
}

async function getUserToken(userId: number): Promise<string> {
  const conn = await getGitHubConnection(userId);
  if (conn) {
    try {
      return await decryptGitHubToken(conn);
    } catch (error) {
      if (!isProviderCredentialError(error)) throw error;
      const systemToken = process.env.GITHUB_TOKEN;
      if (systemToken) return systemToken;
      throw error;
    }
  }

  // Fallback: use system GitHub token from environment (owner's PAT)
  const systemToken = process.env.GITHUB_TOKEN;
  if (systemToken) return systemToken;

  throw new Error("GitHub not connected. Please add your token in Settings.");
}

/**
 * Get the system GitHub username (for listing repos when using system token)
 */
export async function getSystemGitHubUsername(): Promise<string | null> {
  const systemToken = process.env.GITHUB_TOKEN;
  if (!systemToken) return null;
  try {
    const user = await githubFetch(systemToken, "/user");
    return user.login;
  } catch {
    return null;
  }
}

export async function getSystemGitHubDefaults(
  userId: number
): Promise<{ defaultRepo: string | null; defaultBranch: string }> {
  const db = getDb();
  if (!db) return { defaultRepo: null, defaultBranch: "main" };

  const { data } = await db
    .from("user_settings")
    .select("key, value")
    .eq("user_id", userId)
    .in("key", ["github.defaultRepo", "github.defaultBranch"]);

  const settings = Object.fromEntries(
    (data || []).map(row => [row.key, row.value || ""])
  );

  return {
    defaultRepo: settings["github.defaultRepo"] || null,
    defaultBranch: settings["github.defaultBranch"] || "main",
  };
}

// ─── Repository Operations ────────────────────────────────────────────────────

export async function listRepos(userId: number): Promise<any[]> {
  const token = await getUserToken(userId);
  const repos = await githubFetch(
    token,
    "/user/repos?sort=updated&per_page=30"
  );
  return repos.map((r: any) => ({
    id: r.id,
    name: r.name,
    fullName: r.full_name,
    full_name: r.full_name, // also expose as full_name for UI compatibility
    description: r.description,
    private: r.private,
    url: r.html_url,
    defaultBranch: r.default_branch,
    language: r.language,
    updatedAt: r.updated_at,
    stars: r.stargazers_count,
  }));
}

export async function getCommits(
  userId: number,
  repo: string,
  branch?: string
): Promise<any[]> {
  const token = await getUserToken(userId);
  const endpoint = `/repos/${repo}/commits?per_page=20${branch ? `&sha=${branch}` : ""}`;
  const commits = await githubFetch(token, endpoint);
  return commits.map((c: any) => ({
    sha: c.sha.slice(0, 7),
    fullSha: c.sha,
    message: c.commit.message,
    author: c.commit.author.name,
    date: c.commit.author.date,
    url: c.html_url,
  }));
}

export async function listBranches(
  userId: number,
  repo: string
): Promise<any[]> {
  const token = await getUserToken(userId);
  const branches = await githubFetch(
    token,
    `${repositoryEndpoint(repo)}/branches?per_page=100`
  );
  return branches.map((b: any) => ({
    name: b.name,
    sha: b.commit.sha.slice(0, 7),
    protected: b.protected,
  }));
}

export async function getRepositoryOverview(
  userId: number,
  repo: string,
  projectId?: number | null
): Promise<{
  fullName: string;
  description: string | null;
  defaultBranch: string;
  private: boolean;
  archived: boolean;
  language: string | null;
  topics: string[];
  url: string;
  updatedAt: string;
}> {
  const token = await getUserToken(userId);
  const result = await githubFetch(token, repositoryEndpoint(repo));
  const overview = {
    fullName: result.full_name,
    description: result.description,
    defaultBranch: result.default_branch,
    private: Boolean(result.private),
    archived: Boolean(result.archived),
    language: result.language || null,
    topics: Array.isArray(result.topics) ? result.topics : [],
    url: result.html_url,
    updatedAt: result.updated_at,
  };
  await auditGitHubCapability({
    userId,
    action: "repository_overview",
    repository: overview.fullName,
    projectId,
  });
  return overview;
}

export async function getRepositoryTree(
  userId: number,
  repo: string,
  reference?: string,
  projectId?: number | null
): Promise<{
  repository: string;
  reference: string;
  truncated: boolean;
  entries: Array<{
    path: string;
    type: "file" | "directory";
    size: number | null;
    sha: string;
  }>;
}> {
  const token = await getUserToken(userId);
  const validatedReference = validateReference(reference);
  const endpoint = repositoryEndpoint(repo);
  const repository = await githubFetch(token, endpoint);
  const resolvedReference = validatedReference || repository.default_branch;
  const tree = await githubFetch(
    token,
    `${endpoint}/git/trees/${encodeURIComponent(resolvedReference)}?recursive=1`
  );
  const entries = (Array.isArray(tree.tree) ? tree.tree : [])
    .filter((item: any) => item.type === "blob" || item.type === "tree")
    .slice(0, 2_000)
    .map((item: any) => ({
      path: item.path,
      type: item.type === "tree" ? "directory" : "file",
      size: typeof item.size === "number" ? item.size : null,
      sha: item.sha,
    }));

  await auditGitHubCapability({
    userId,
    action: "repository_tree",
    repository: repository.full_name,
    reference: resolvedReference,
    resultCount: entries.length,
    projectId,
  });

  return {
    repository: repository.full_name,
    reference: resolvedReference,
    truncated: Boolean(tree.truncated) || entries.length >= 2_000,
    entries,
  };
}

export async function readRepositoryFile(
  userId: number,
  repo: string,
  path: string,
  reference?: string,
  projectId?: number | null
): Promise<{
  repository: string;
  path: string;
  reference: string | null;
  sha: string;
  size: number;
  content: string;
  truncated: boolean;
}> {
  const token = await getUserToken(userId);
  const endpoint = repositoryEndpoint(repo);
  const validatedPath = validateRepositoryPath(path);
  const validatedReference = validateReference(reference);
  const query = validatedReference
    ? `?ref=${encodeURIComponent(validatedReference)}`
    : "";
  const file = await githubFetch(
    token,
    `${endpoint}/contents/${validatedPath.split("/").map(encodeURIComponent).join("/")}${query}`
  );
  if (
    Array.isArray(file) ||
    file.type !== "file" ||
    typeof file.content !== "string"
  ) {
    throw new Error("The requested path is not a readable text file.");
  }
  if (typeof file.size === "number" && file.size > MAX_READ_FILE_BYTES) {
    throw new Error(
      `This file is ${file.size.toLocaleString()} bytes. Toríu reads files up to ${MAX_READ_FILE_BYTES.toLocaleString()} bytes.`
    );
  }
  const decoded = Buffer.from(
    file.content.replace(/\n/g, ""),
    "base64"
  ).toString("utf8");
  const content = truncateText(decoded, MAX_READ_FILE_BYTES);

  await auditGitHubCapability({
    userId,
    action: "repository_file_read",
    repository: validateRepository(repo),
    reference: validatedReference,
    path: validatedPath,
    resultCount: 1,
    projectId,
  });

  return {
    repository: validateRepository(repo),
    path: validatedPath,
    reference: validatedReference || null,
    sha: file.sha,
    size: file.size,
    content,
    truncated: content.length < decoded.length,
  };
}

export async function searchRepositoryCode(
  userId: number,
  repo: string,
  query: string,
  projectId?: number | null
): Promise<{
  repository: string;
  query: string;
  totalCount: number;
  results: Array<{ path: string; name: string; sha: string; url: string }>;
}> {
  const token = await getUserToken(userId);
  const validatedRepo = validateRepository(repo);
  const normalizedQuery = query.trim().replace(/\s+/g, " ");
  if (normalizedQuery.length < 2 || normalizedQuery.length > 160) {
    throw new Error(
      "Code search queries must be between 2 and 160 characters."
    );
  }
  const search = await githubFetch(
    token,
    `/search/code?q=${encodeURIComponent(`${normalizedQuery} repo:${validatedRepo}`)}&per_page=30`
  );
  const results = (Array.isArray(search.items) ? search.items : []).map(
    (item: any) => ({
      path: item.path,
      name: item.name,
      sha: item.sha,
      url: item.html_url,
    })
  );

  await auditGitHubCapability({
    userId,
    action: "repository_code_search",
    repository: validatedRepo,
    query: normalizedQuery,
    resultCount: results.length,
    projectId,
  });

  return {
    repository: validatedRepo,
    query: normalizedQuery,
    totalCount:
      typeof search.total_count === "number"
        ? search.total_count
        : results.length,
    results,
  };
}

export async function createPullRequestFromProposal(
  userId: number,
  params: {
    repository: string;
    baseBranch: string;
    branchName: string;
    title: string;
    body: string;
    commitMessage: string;
    files: Array<{ path: string; content: string }>;
  }
): Promise<{ number: number; url: string; commitSha: string }> {
  const token = await getUserToken(userId);
  const endpoint = repositoryEndpoint(params.repository);
  const baseBranch = validateReference(params.baseBranch);
  const branchName = validateReference(params.branchName);
  if (!baseBranch || !branchName?.startsWith("toriu/")) {
    throw new Error("Approved GitHub branches must use the toriu/ namespace.");
  }
  if (baseBranch === branchName) {
    throw new Error(
      "The proposal branch must be different from its base branch."
    );
  }
  if (!params.files.length || params.files.length > 50) {
    throw new Error(
      "Approved pull requests must contain between 1 and 50 files."
    );
  }

  const baseRef = await githubFetch(
    token,
    `${endpoint}/git/ref/heads/${encodeURIComponent(baseBranch)}`
  );
  const baseCommitSha = baseRef.object.sha;
  const baseCommit = await githubFetch(
    token,
    `${endpoint}/git/commits/${encodeURIComponent(baseCommitSha)}`
  );

  const treeItems = await Promise.all(
    params.files.map(async file => {
      const path = validateRepositoryPath(file.path);
      const blob = await githubFetch(token, `${endpoint}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({ content: file.content, encoding: "utf-8" }),
      });
      return { path, mode: "100644", type: "blob", sha: blob.sha };
    })
  );

  const tree = await githubFetch(token, `${endpoint}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree: treeItems }),
  });
  const commit = await githubFetch(token, `${endpoint}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message: params.commitMessage.trim(),
      tree: tree.sha,
      parents: [baseCommitSha],
    }),
  });
  await githubFetch(token, `${endpoint}/git/refs`, {
    method: "POST",
    body: JSON.stringify({
      ref: `refs/heads/${branchName}`,
      sha: commit.sha,
    }),
  });

  const pullRequest = await githubFetch(token, `${endpoint}/pulls`, {
    method: "POST",
    body: JSON.stringify({
      title: params.title.trim(),
      body: `${params.body.trim()}\n\n---\nCreated by Toríu after explicit owner approval. Toríu cannot merge this pull request.`.trim(),
      head: branchName,
      base: baseBranch,
      draft: true,
    }),
  });

  return {
    number: pullRequest.number,
    url: pullRequest.html_url,
    commitSha: commit.sha,
  };
}

// ─── Pull Code ────────────────────────────────────────────────────────────────

export async function pullFiles(
  userId: number,
  repo: string,
  branch = "main"
): Promise<{ path: string; content: string }[]> {
  const token = await getUserToken(userId);

  const refData = await githubFetch(
    token,
    `/repos/${repo}/git/ref/heads/${branch}`
  );
  const commitSha = refData.object.sha;
  const commitData = await githubFetch(
    token,
    `/repos/${repo}/git/commits/${commitSha}`
  );
  const treeSha = commitData.tree.sha;
  const tree = await githubFetch(
    token,
    `/repos/${repo}/git/trees/${treeSha}?recursive=1`
  );

  const files: { path: string; content: string }[] = [];
  const fileItems = tree.tree.filter(
    (item: any) =>
      item.type === "blob" &&
      item.size < 100000 &&
      !item.path.includes("node_modules") &&
      !item.path.includes(".git") &&
      !item.path.endsWith(".lock")
  );

  const toFetch = fileItems.slice(0, 50);
  for (const item of toFetch) {
    try {
      const blob = await githubFetch(
        token,
        `/repos/${repo}/git/blobs/${item.sha}`
      );
      const content = Buffer.from(blob.content, "base64").toString("utf8");
      files.push({ path: item.path, content });
    } catch {
      // Skip files that can't be decoded
    }
  }

  return files;
}

// ─── Update Default Repo/Branch ───────────────────────────────────────────────

export async function updateDefaults(
  userId: number,
  defaultRepo?: string,
  defaultBranch?: string
): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const updates: any = {};
  if (defaultRepo !== undefined) updates.default_repo = defaultRepo;
  if (defaultBranch !== undefined) updates.default_branch = defaultBranch;
  if (Object.keys(updates).length === 0) return false;

  const connection = await getGitHubConnection(userId);
  if (connection) {
    const { error } = await db
      .from("github_connections")
      .update(updates)
      .eq("user_id", userId);
    if (error)
      throw new Error(`Failed to save GitHub defaults: ${error.message}`);
    return true;
  }

  if (!process.env.GITHUB_TOKEN) return false;

  const rows = Object.entries({
    ...(defaultRepo !== undefined ? { "github.defaultRepo": defaultRepo } : {}),
    ...(defaultBranch !== undefined
      ? { "github.defaultBranch": defaultBranch }
      : {}),
  }).map(([key, value]) => ({ user_id: userId, key, value }));

  const { error } = await db
    .from("user_settings")
    .upsert(rows, { onConflict: "user_id,key" });
  if (error)
    throw new Error(`Failed to save GitHub defaults: ${error.message}`);
  return true;
}
