/**
 * Platform Deploy Service (Supabase)
 * Handles deployment to Vercel, Netlify, and Railway via their APIs.
 */
import crypto from "crypto";
import { getSupabaseAdmin } from "./supabase";
import { sendBuildCompleteEmail } from "./services/email";

function getDb() {
  return getSupabaseAdmin();
}

// ─── Encryption ─────────────────────────────────────────────────────────────

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

// ─── Types ──────────────────────────────────────────────────────────────────

export type Platform = "vercel" | "netlify" | "railway";
export type DeployStatus = "queued" | "building" | "deploying" | "live" | "failed" | "cancelled";

export interface DeployRequest {
  projectId: number;
  userId: number;
  platform: Platform;
  projectName: string;
  files: Array<{ filepath: string; content: string }>;
  commitMessage?: string;
}

export interface DeployResult {
  success: boolean;
  deploymentId?: string;
  url?: string;
  error?: string;
}

export interface PlatformStatus {
  platform: Platform;
  connected: boolean;
  username?: string;
  teamId?: string;
}

// ─── Platform Connection Management ─────────────────────────────────────────

export async function connectPlatform(
  userId: number,
  platform: Platform,
  token: string
): Promise<{ success: boolean; username?: string; error?: string }> {
  const db = getDb();
  if (!db) return { success: false, error: "Database not available" };

  try {
    const userInfo = await validatePlatformToken(platform, token);

    const { data: existing } = await db
      .from("platform_connections")
      .select("id")
      .eq("user_id", userId)
      .eq("platform", platform)
      .limit(1);

    const tokenEncrypted = encrypt(token);
    if (existing && existing.length > 0) {
      await db.from("platform_connections")
        .update({ token_encrypted: tokenEncrypted, username: userInfo.username, team_id: userInfo.teamId || null })
        .eq("id", existing[0].id);
    } else {
      await db.from("platform_connections").insert({
        user_id: userId,
        platform,
        token_encrypted: tokenEncrypted,
        username: userInfo.username,
        team_id: userInfo.teamId || null,
      });
    }
    return { success: true, username: userInfo.username };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to validate token" };
  }
}

export async function disconnectPlatform(userId: number, platform: Platform): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.from("platform_connections").delete().eq("user_id", userId).eq("platform", platform);
}

export async function getPlatformStatuses(userId: number): Promise<PlatformStatus[]> {
  const db = getDb();
  if (!db) return ["vercel", "netlify", "railway"].map(p => ({ platform: p as Platform, connected: !!getSystemToken(p as Platform) }));

  const { data: connections } = await db
    .from("platform_connections")
    .select("*")
    .eq("user_id", userId);

  const platforms: Platform[] = ["vercel", "netlify", "railway"];
  return platforms.map(p => {
    const conn = (connections || []).find((c: any) => c.platform === p);
    const hasSystemToken = !!getSystemToken(p);
    return {
      platform: p,
      connected: !!conn || hasSystemToken,
      username: conn?.username || (hasSystemToken ? "system" : undefined),
      teamId: conn?.team_id || undefined,
    };
  });
}

async function getPlatformToken(userId: number, platform: Platform): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const { data } = await db
    .from("platform_connections")
    .select("token_encrypted")
    .eq("user_id", userId)
    .eq("platform", platform)
    .limit(1)
    .single();
  if (!data) return null;
  return decrypt(data.token_encrypted);
}

// ─── Token Validation ───────────────────────────────────────────────────────

async function validatePlatformToken(
  platform: Platform,
  token: string
): Promise<{ username: string; teamId?: string }> {
  switch (platform) {
    case "vercel": {
      const res = await fetch("https://api.vercel.com/v2/user", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Invalid Vercel token");
      const data = await res.json() as any;
      return { username: data.user?.username || data.user?.name || "vercel-user" };
    }
    case "netlify": {
      const res = await fetch("https://api.netlify.com/api/v1/user", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Invalid Netlify token");
      const data = await res.json() as any;
      return { username: data.slug || data.full_name || "netlify-user" };
    }
    case "railway": {
      const res = await fetch("https://backboard.railway.app/graphql/v2", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: "{ me { name email } }" }),
      });
      if (!res.ok) throw new Error("Invalid Railway token");
      const data = await res.json() as any;
      if (data.errors) throw new Error("Invalid Railway token");
      return { username: data.data?.me?.name || "railway-user" };
    }
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

// ─── System Token Fallback ─────────────────────────────────────────────────

function getSystemToken(platform: Platform): string | null {
  switch (platform) {
    case "netlify": return process.env.NETLIFY_TOKEN || null;
    case "vercel": return process.env.VERCEL_TOKEN || null;
    case "railway": return process.env.RAILWAY_TOKEN || null;
    default: return null;
  }
}

// ─── Deployment Operations ──────────────────────────────────────────────────

export async function deployToExternalPlatform(req: DeployRequest): Promise<DeployResult> {
  let token = await getPlatformToken(req.userId, req.platform);
  if (!token) token = getSystemToken(req.platform);
  if (!token) {
    return { success: false, error: `${req.platform} is not connected. Add your token in Settings.` };
  }

  const db = getDb();
  if (!db) return { success: false, error: "Database not available" };

  const { data: record, error: insertErr } = await db.from("deployments").insert({
    project_id: req.projectId,
    user_id: req.userId,
    platform: req.platform,
    status: "building",
    project_name: req.projectName,
    commit_message: req.commitMessage || "Deploy from Q Workspace",
  }).select("id").single();

  if (insertErr || !record) return { success: false, error: "Failed to create deployment record" };
  const deployId = record.id;

  try {
    let result: DeployResult;
    switch (req.platform) {
      case "vercel": result = await deployToVercel(token, req); break;
      case "netlify": result = await deployToNetlify(token, req); break;
      case "railway": result = await deployToRailway(token, req); break;
      default: result = { success: false, error: "Unsupported platform" };
    }

    await db.from("deployments").update({
      status: result.success ? "live" : "failed",
      url: result.url || null,
      deployment_id: result.deploymentId || null,
      error: result.error || null,
      completed_at: new Date().toISOString(),
    }).eq("id", deployId);

    // Send build complete email on successful deployment
    if (result.success && result.url) {
      const { data: user } = await db
        .from("users")
        .select("email")
        .eq("id", req.userId)
        .single();
      if (user?.email) {
        sendBuildCompleteEmail(user.email, req.projectName, result.url).catch((err) => {
          console.error("[Deploy] Failed to send build complete email:", err);
        });
      }
    }

    return result;
  } catch (error: any) {
    await db.from("deployments").update({
      status: "failed",
      error: error.message || "Deployment failed",
      completed_at: new Date().toISOString(),
    }).eq("id", deployId);
    return { success: false, error: error.message || "Deployment failed" };
  }
}

// ─── Vercel Deployment ──────────────────────────────────────────────────────

async function deployToVercel(token: string, req: DeployRequest): Promise<DeployResult> {
  const name = req.projectName.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 52);
  const vercelFiles = req.files.map(f => ({
    file: f.filepath.replace(/^\/+/, ""),
    data: Buffer.from(f.content).toString("base64"),
    encoding: "base64" as const,
  }));
  const body = { name, files: vercelFiles, projectSettings: { framework: null }, target: "production" };
  const res = await fetch("https://api.vercel.com/v13/deployments", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json() as any;
  if (!res.ok) {
    return { success: false, error: data?.error?.message || data?.message || `Vercel API error (${res.status})` };
  }
  const url = data.url ? `https://${data.url}` : data.alias?.[0] ? `https://${data.alias[0]}` : undefined;
  return { success: true, deploymentId: data.id, url: url || `https://${name}.vercel.app` };
}

// ─── Netlify Deployment ─────────────────────────────────────────────────────

async function deployToNetlify(token: string, req: DeployRequest): Promise<DeployResult> {
  const siteName = req.projectName.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 52);

  let siteId: string;
  try {
    const createRes = await fetch("https://api.netlify.com/api/v1/sites", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: siteName }),
    });
    if (createRes.ok) {
      const site = await createRes.json() as any;
      siteId = site.id;
    } else {
      const listRes = await fetch(`https://api.netlify.com/api/v1/sites?name=${siteName}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const sites = await listRes.json() as any[];
      const existing = sites?.find((s: any) => s.name === siteName);
      if (existing) { siteId = existing.id; }
      else { return { success: false, error: "Failed to create Netlify site" }; }
    }
  } catch (e: any) {
    return { success: false, error: `Netlify site creation failed: ${e.message}` };
  }

  const fileDigests: Record<string, string> = {};
  const fileContents: Record<string, string> = {};
  for (const file of req.files) {
    const path = "/" + file.filepath.replace(/^\/+/, "");
    const hash = crypto.createHash("sha1").update(file.content).digest("hex");
    fileDigests[path] = hash;
    fileContents[hash] = file.content;
  }

  const deployRes = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/deploys`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ files: fileDigests, title: req.commitMessage || "Deploy from Q Workspace" }),
  });
  if (!deployRes.ok) {
    const err = await deployRes.text();
    return { success: false, error: `Netlify deploy failed: ${err}` };
  }
  const deploy = await deployRes.json() as any;

  const hashToPath: Record<string, string> = {};
  for (const [path, hash] of Object.entries(fileDigests)) {
    hashToPath[hash as string] = path;
  }
  const required: string[] = deploy.required || [];
  for (const hash of required) {
    const content = fileContents[hash];
    const filePath = hashToPath[hash];
    if (!content || !filePath) continue;
    await fetch(`https://api.netlify.com/api/v1/deploys/${deploy.id}/files${filePath}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" },
      body: content,
    });
  }

  return { success: true, deploymentId: deploy.id, url: deploy.ssl_url || deploy.url || `https://${siteName}.netlify.app` };
}

// ─── Railway Deployment ─────────────────────────────────────────────────────

async function deployToRailway(token: string, req: DeployRequest): Promise<DeployResult> {
  const projectName = req.projectName.replace(/[^a-zA-Z0-9-_ ]/g, "").slice(0, 50);

  const createProjectQuery = `mutation { projectCreate(input: { name: "${projectName}" }) { id name } }`;
  const projectRes = await railwayGQL(token, createProjectQuery);
  if (projectRes.errors) {
    return { success: false, error: `Railway project creation failed: ${projectRes.errors[0]?.message}` };
  }
  const railwayProjectId = projectRes.data?.projectCreate?.id;
  if (!railwayProjectId) return { success: false, error: "Failed to create Railway project" };

  const serviceQuery = `mutation { serviceCreate(input: { projectId: "${railwayProjectId}", name: "${projectName}-service" }) { id name } }`;
  const serviceRes = await railwayGQL(token, serviceQuery);
  if (serviceRes.errors) {
    return { success: false, error: `Railway service creation failed: ${serviceRes.errors[0]?.message}` };
  }

  return { success: true, deploymentId: railwayProjectId, url: `https://railway.app/project/${railwayProjectId}` };
}

async function railwayGQL(token: string, query: string): Promise<any> {
  const res = await fetch("https://backboard.railway.app/graphql/v2", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return res.json();
}

// ─── Deployment History ─────────────────────────────────────────────────────

export async function getDeploymentHistory(userId: number, limit = 20) {
  const db = getDb();
  if (!db) return [];
  const { data } = await db
    .from("deployments")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data || [];
}

export async function getDeploymentStatus(deploymentDbId: number, userId: number) {
  const db = getDb();
  if (!db) return null;
  const { data } = await db
    .from("deployments")
    .select("*")
    .eq("id", deploymentDbId)
    .eq("user_id", userId)
    .single();
  return data || null;
}
