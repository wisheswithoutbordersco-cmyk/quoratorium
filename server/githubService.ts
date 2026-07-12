/**
 * GitHub Integration Service (Supabase)
 * Handles: token encryption, repo operations, push/pull, commits, branches
 */
import crypto from "crypto";
import { getSupabaseAdmin } from "./supabase";

function getDb() {
  return getSupabaseAdmin();
}

// Use JWT_SECRET as encryption key (first 32 bytes)
function getEncryptionKey(): Buffer {
  const secret = process.env.JWT_SECRET || "fallback-secret-key-for-dev-only";
  return crypto.createHash("sha256").update(secret).digest();
}

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", getEncryptionKey(), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decrypt(encryptedText: string): string {
  const [ivHex, encrypted] = encryptedText.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", getEncryptionKey(), iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// ─── GitHub API Helpers ───────────────────────────────────────────────────────

async function githubFetch(token: string, endpoint: string, options: RequestInit = {}): Promise<any> {
  const url = endpoint.startsWith("http") ? endpoint : `https://api.github.com${endpoint}`;
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

// ─── Connection Management ────────────────────────────────────────────────────

export async function connectGitHub(userId: number, token: string): Promise<{ username: string }> {
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
    await db.from("github_connections")
      .update({ token_encrypted: encrypt(token), username })
      .eq("user_id", userId);
  } else {
    await db.from("github_connections").insert({
      user_id: userId,
      token_encrypted: encrypt(token),
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

async function getUserToken(userId: number): Promise<string> {
  const conn = await getGitHubConnection(userId);
  if (conn) return decrypt(conn.token_encrypted);
  
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

// ─── Repository Operations ────────────────────────────────────────────────────

export async function listRepos(userId: number): Promise<any[]> {
  const token = await getUserToken(userId);
  const repos = await githubFetch(token, "/user/repos?sort=updated&per_page=30");
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

export async function createRepo(userId: number, name: string, description?: string, isPrivate = true): Promise<any> {
  const token = await getUserToken(userId);
  const repo = await githubFetch(token, "/user/repos", {
    method: "POST",
    body: JSON.stringify({
      name,
      description: description || `Created from Q Workspace`,
      private: isPrivate,
      auto_init: true,
    }),
  });
  return {
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    url: repo.html_url,
    cloneUrl: repo.clone_url,
  };
}

export async function getCommits(userId: number, repo: string, branch?: string): Promise<any[]> {
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

export async function listBranches(userId: number, repo: string): Promise<any[]> {
  const token = await getUserToken(userId);
  const branches = await githubFetch(token, `/repos/${repo}/branches`);
  return branches.map((b: any) => ({
    name: b.name,
    sha: b.commit.sha.slice(0, 7),
    protected: b.protected,
  }));
}

export async function createBranch(userId: number, repo: string, branchName: string, fromBranch?: string): Promise<any> {
  const token = await getUserToken(userId);
  const source = fromBranch || "main";
  const ref = await githubFetch(token, `/repos/${repo}/git/ref/heads/${source}`);
  const sha = ref.object.sha;

  await githubFetch(token, `/repos/${repo}/git/refs`, {
    method: "POST",
    body: JSON.stringify({
      ref: `refs/heads/${branchName}`,
      sha,
    }),
  });
  return { name: branchName, sha: sha.slice(0, 7) };
}

// ─── Push Code ────────────────────────────────────────────────────────────────

export async function pushFiles(
  userId: number,
  repo: string,
  files: { path: string; content: string }[],
  commitMessage: string,
  branch = "main"
): Promise<{ commitSha: string; url: string }> {
  const token = await getUserToken(userId);

  const refData = await githubFetch(token, `/repos/${repo}/git/ref/heads/${branch}`);
  const latestCommitSha = refData.object.sha;

  const commitData = await githubFetch(token, `/repos/${repo}/git/commits/${latestCommitSha}`);
  const baseTreeSha = commitData.tree.sha;

  const treeItems = await Promise.all(
    files.map(async (file) => {
      const blob = await githubFetch(token, `/repos/${repo}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({
          content: Buffer.from(file.content).toString("base64"),
          encoding: "base64",
        }),
      });
      return {
        path: file.path,
        mode: "100644" as const,
        type: "blob" as const,
        sha: blob.sha,
      };
    })
  );

  const newTree = await githubFetch(token, `/repos/${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: treeItems,
    }),
  });

  const newCommit = await githubFetch(token, `/repos/${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message: commitMessage,
      tree: newTree.sha,
      parents: [latestCommitSha],
    }),
  });

  await githubFetch(token, `/repos/${repo}/git/refs/heads/${branch}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: newCommit.sha }),
  });

  return {
    commitSha: newCommit.sha.slice(0, 7),
    url: `https://github.com/${repo}/commit/${newCommit.sha}`,
  };
}

// ─── Pull Code ────────────────────────────────────────────────────────────────

export async function pullFiles(userId: number, repo: string, branch = "main"): Promise<{ path: string; content: string }[]> {
  const token = await getUserToken(userId);

  const refData = await githubFetch(token, `/repos/${repo}/git/ref/heads/${branch}`);
  const commitSha = refData.object.sha;
  const commitData = await githubFetch(token, `/repos/${repo}/git/commits/${commitSha}`);
  const treeSha = commitData.tree.sha;
  const tree = await githubFetch(token, `/repos/${repo}/git/trees/${treeSha}?recursive=1`);

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
      const blob = await githubFetch(token, `/repos/${repo}/git/blobs/${item.sha}`);
      const content = Buffer.from(blob.content, "base64").toString("utf8");
      files.push({ path: item.path, content });
    } catch {
      // Skip files that can't be decoded
    }
  }

  return files;
}

// ─── Update Default Repo/Branch ───────────────────────────────────────────────

export async function updateDefaults(userId: number, defaultRepo?: string, defaultBranch?: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const updates: any = {};
  if (defaultRepo !== undefined) updates.default_repo = defaultRepo;
  if (defaultBranch !== undefined) updates.default_branch = defaultBranch;
  if (Object.keys(updates).length === 0) return false;
  await db.from("github_connections").update(updates).eq("user_id", userId);
  return true;
}
