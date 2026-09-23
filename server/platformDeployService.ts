/**
 * Platform Deploy Service (Supabase)
 * Handles deployment to Vercel, Netlify, and Railway via their APIs.
 */
import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "./supabase";
import { sendBuildCompleteEmail } from "./services/email";
import {
  decryptProviderCredential,
  encryptProviderCredential,
  isProviderCredentialError,
} from "./providerCredentialCrypto";

function getDb() {
  return getSupabaseAdmin();
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type Platform = "vercel" | "netlify" | "railway";
export type DeployStatus =
  | "queued"
  | "building"
  | "deploying"
  | "live"
  | "failed"
  | "cancelled";

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
  /** Database primary key for the persisted deployment record. */
  deploymentDbId?: number;
  /** Identifier assigned by the hosting provider. */
  deploymentId?: string;
  status?: DeployStatus;
  url?: string;
  error?: string;
}

export interface DeploymentDto {
  id: number;
  projectId: number;
  userId: number;
  platform: string;
  status: DeployStatus;
  url: string | null;
  providerDeploymentId: string | null;
  projectName: string | null;
  branch: string | null;
  commitMessage: string | null;
  logs: string | null;
  error: string | null;
  metadata: unknown;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
}

type DeploymentRecord = {
  id: number;
  project_id: number;
  user_id: number;
  platform: string;
  status: DeployStatus;
  url: string | null;
  deployment_id: string | null;
  project_name: string | null;
  branch: string | null;
  commit_message: string | null;
  logs: string | null;
  error: string | null;
  metadata: unknown;
  started_at: string;
  completed_at: string | null;
  created_at: string;
};

/** Convert database snake_case records to the API contract used by the client. */
export function toDeploymentDto(record: DeploymentRecord): DeploymentDto {
  return {
    id: record.id,
    projectId: record.project_id,
    userId: record.user_id,
    platform: record.platform,
    status: record.status,
    url: record.url,
    providerDeploymentId: record.deployment_id,
    projectName: record.project_name,
    branch: record.branch,
    commitMessage: record.commit_message,
    logs: record.logs,
    error: record.error,
    metadata: record.metadata,
    startedAt: record.started_at,
    completedAt: record.completed_at,
    createdAt: record.created_at,
  };
}

export function providerStatusToDeployStatus(
  platform: Exclude<Platform, "railway">,
  providerStatus: string | undefined | null
): DeployStatus {
  const value = (providerStatus || "").toUpperCase();
  if (platform === "vercel") {
    if (value === "READY") return "live";
    if (["ERROR", "CANCELED", "CANCELLED"].includes(value))
      return value === "ERROR" ? "failed" : "cancelled";
    if (["QUEUED", "INITIALIZING"].includes(value)) return "queued";
    return "building";
  }

  if (["READY", "PUBLISHED"].includes(value)) return "live";
  if (["ERROR", "FAILED"].includes(value)) return "failed";
  if (["CANCELLED", "CANCELED"].includes(value)) return "cancelled";
  if (["NEW", "ENQUEUED", "QUEUED"].includes(value)) return "queued";
  return "building";
}

export interface PlatformStatus {
  platform: Platform;
  connected: boolean;
  username?: string;
  teamId?: string;
  reconnectRequired?: boolean;
  deploymentSupported: boolean;
  unsupportedReason?: string;
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

    const tokenEncrypted = encryptProviderCredential(token, platform);
    if (existing && existing.length > 0) {
      await db
        .from("platform_connections")
        .update({
          token_encrypted: tokenEncrypted,
          username: userInfo.username,
          team_id: userInfo.teamId || null,
        })
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
    return {
      success: false,
      error: error.message || "Failed to validate token",
    };
  }
}

export async function disconnectPlatform(
  userId: number,
  platform: Platform
): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db
    .from("platform_connections")
    .delete()
    .eq("user_id", userId)
    .eq("platform", platform);
}

export async function getPlatformStatuses(
  userId: number
): Promise<PlatformStatus[]> {
  const db = getDb();
  if (!db) {
    return ["vercel", "netlify", "railway"].map(p => ({
      platform: p as Platform,
      connected: !!getSystemToken(p as Platform),
      deploymentSupported: p !== "railway",
      unsupportedReason:
        p === "railway"
          ? "Source deployments to Railway are not supported yet."
          : undefined,
    }));
  }

  const { data: connections } = await db
    .from("platform_connections")
    .select("*")
    .eq("user_id", userId);

  const platforms: Platform[] = ["vercel", "netlify", "railway"];
  return platforms.map(p => {
    const conn = (connections || []).find((c: any) => c.platform === p);
    const hasSystemToken = !!getSystemToken(p);
    let savedCredentialReadable = false;
    if (conn) {
      try {
        decryptProviderCredential(conn.token_encrypted, p);
        savedCredentialReadable = true;
      } catch (error) {
        if (!isProviderCredentialError(error)) throw error;
        console.warn(
          `[Deploy] Saved ${p} credential needs reconnection:`,
          error.message
        );
      }
    }
    return {
      platform: p,
      connected: savedCredentialReadable || hasSystemToken,
      username: savedCredentialReadable
        ? conn?.username
        : hasSystemToken
          ? "system"
          : undefined,
      teamId: savedCredentialReadable ? conn?.team_id || undefined : undefined,
      reconnectRequired: Boolean(conn && !savedCredentialReadable),
      deploymentSupported: p !== "railway",
      unsupportedReason:
        p === "railway"
          ? "Source deployments to Railway are not supported yet."
          : undefined,
    };
  });
}

async function getPlatformToken(
  userId: number,
  platform: Platform
): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const { data } = await db
    .from("platform_connections")
    .select("token_encrypted")
    .eq("user_id", userId)
    .eq("platform", platform)
    .limit(1)
    .single();
  if (!data) return getSystemToken(platform);
  try {
    const decrypted = decryptProviderCredential(data.token_encrypted, platform);
    if (decrypted.needsRotation) {
      const { error } = await db
        .from("platform_connections")
        .update({
          token_encrypted: encryptProviderCredential(
            decrypted.value,
            platform
          ),
        })
        .eq("user_id", userId)
        .eq("platform", platform);
      if (error) {
        console.warn(
          `[Deploy] ${platform} credential worked but could not be rotated:`,
          error.message
        );
      }
    }
    return decrypted.value;
  } catch (error) {
    if (!isProviderCredentialError(error)) throw error;
    const systemToken = getSystemToken(platform);
    if (systemToken) return systemToken;
    throw error;
  }
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
      const data = (await res.json()) as any;
      return {
        username: data.user?.username || data.user?.name || "vercel-user",
      };
    }
    case "netlify": {
      const res = await fetch("https://api.netlify.com/api/v1/user", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Invalid Netlify token");
      const data = (await res.json()) as any;
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
      const data = (await res.json()) as any;
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
    case "netlify":
      return process.env.NETLIFY_TOKEN || null;
    case "vercel":
      return process.env.VERCEL_TOKEN || null;
    case "railway":
      return process.env.RAILWAY_TOKEN || null;
    default:
      return null;
  }
}

// ─── Deployment Operations ──────────────────────────────────────────────────

export async function deployToExternalPlatform(
  req: DeployRequest
): Promise<DeployResult> {
  // Railway's API call below used to create an empty project and service without
  // uploading source. Do not create provider resources until source deployment is
  // implemented end-to-end.
  if (req.platform === "railway") {
    return {
      success: false,
      status: "failed",
      error:
        "Railway source deployments are not supported yet. No Railway service was created.",
    };
  }

  let token = await getPlatformToken(req.userId, req.platform);
  if (!token) token = getSystemToken(req.platform);
  if (!token) {
    return {
      success: false,
      error: `${req.platform} is not connected. Add your token in Settings.`,
    };
  }

  const db = getDb();
  if (!db) return { success: false, error: "Database not available" };

  const { data: record, error: insertErr } = await db
    .from("deployments")
    .insert({
      project_id: req.projectId,
      user_id: req.userId,
      platform: req.platform,
      status: "queued",
      project_name: req.projectName,
      commit_message: req.commitMessage || "Deploy from Q Workspace",
    })
    .select("id")
    .single();

  if (insertErr || !record)
    return { success: false, error: "Failed to create deployment record" };
  const deployId = record.id;

  try {
    let result: DeployResult;
    switch (req.platform) {
      case "vercel":
        result = await deployToVercel(token, req);
        break;
      case "netlify":
        result = await deployToNetlify(token, req);
        break;
      default:
        result = { success: false, error: "Unsupported platform" };
    }

    const status = result.success ? result.status || "building" : "failed";
    await db
      .from("deployments")
      .update({
        status,
        url: result.url || null,
        deployment_id: result.deploymentId || null,
        error: result.error || null,
        completed_at:
          status === "live" || status === "failed" || status === "cancelled"
            ? new Date().toISOString()
            : null,
      })
      .eq("id", deployId);

    // Only notify after the provider has actually reported a live deployment.
    if (result.success && status === "live" && result.url) {
      const { data: user } = await db
        .from("users")
        .select("email")
        .eq("id", req.userId)
        .single();
      if (user?.email) {
        sendBuildCompleteEmail(user.email, req.projectName, result.url).catch(
          err => {
            console.error("[Deploy] Failed to send build complete email:", err);
          }
        );
      }
    }

    return { ...result, deploymentDbId: deployId, status };
  } catch (error: any) {
    await db
      .from("deployments")
      .update({
        status: "failed",
        error: error.message || "Deployment failed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", deployId);
    return { success: false, error: error.message || "Deployment failed" };
  }
}

// ─── Vercel Deployment ──────────────────────────────────────────────────────

async function deployToVercel(
  token: string,
  req: DeployRequest
): Promise<DeployResult> {
  const name = req.projectName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 52);
  const vercelFiles = req.files.map(f => ({
    file: f.filepath.replace(/^\/+/, ""),
    data: Buffer.from(f.content).toString("base64"),
    encoding: "base64" as const,
  }));
  const body = {
    name,
    files: vercelFiles,
    projectSettings: { framework: null },
    target: "production",
  };
  const res = await fetch("https://api.vercel.com/v13/deployments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as any;
  if (!res.ok) {
    return {
      success: false,
      error:
        data?.error?.message ||
        data?.message ||
        `Vercel API error (${res.status})`,
    };
  }
  if (!data.id)
    return { success: false, error: "Vercel did not return a deployment ID" };
  const url = data.url
    ? `https://${data.url}`
    : data.alias?.[0]
      ? `https://${data.alias[0]}`
      : undefined;
  return {
    success: true,
    deploymentId: data.id,
    url,
    status: providerStatusToDeployStatus("vercel", data.readyState),
  };
}

// ─── Netlify Deployment ─────────────────────────────────────────────────────

async function deployToNetlify(
  token: string,
  req: DeployRequest
): Promise<DeployResult> {
  const siteName = req.projectName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 52);

  let siteId: string;
  try {
    const createRes = await fetch("https://api.netlify.com/api/v1/sites", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: siteName }),
    });
    if (createRes.ok) {
      const site = (await createRes.json()) as any;
      siteId = site.id;
    } else {
      const listRes = await fetch(
        `https://api.netlify.com/api/v1/sites?name=${siteName}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const sites = (await listRes.json()) as any[];
      const existing = sites?.find((s: any) => s.name === siteName);
      if (existing) {
        siteId = existing.id;
      } else {
        return { success: false, error: "Failed to create Netlify site" };
      }
    }
  } catch (e: any) {
    return {
      success: false,
      error: `Netlify site creation failed: ${e.message}`,
    };
  }

  const fileDigests: Record<string, string> = {};
  const fileContents: Record<string, string> = {};
  for (const file of req.files) {
    const path = "/" + file.filepath.replace(/^\/+/, "");
    const hash = createHash("sha1").update(file.content).digest("hex");
    fileDigests[path] = hash;
    fileContents[hash] = file.content;
  }

  const deployRes = await fetch(
    `https://api.netlify.com/api/v1/sites/${siteId}/deploys`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        files: fileDigests,
        title: req.commitMessage || "Deploy from Q Workspace",
      }),
    }
  );
  if (!deployRes.ok) {
    const err = await deployRes.text();
    return { success: false, error: `Netlify deploy failed: ${err}` };
  }
  const deploy = (await deployRes.json()) as any;

  const hashToPath: Record<string, string> = {};
  for (const [path, hash] of Object.entries(fileDigests)) {
    hashToPath[hash as string] = path;
  }
  const required: string[] = deploy.required || [];
  for (const hash of required) {
    const content = fileContents[hash];
    const filePath = hashToPath[hash];
    if (!content || !filePath) continue;
    const fileRes = await fetch(
      `https://api.netlify.com/api/v1/deploys/${deploy.id}/files${filePath}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/octet-stream",
        },
        body: content,
      }
    );
    if (!fileRes.ok) {
      return {
        success: false,
        error: `Netlify file upload failed for ${filePath} (${fileRes.status})`,
      };
    }
  }

  if (!deploy.id)
    return { success: false, error: "Netlify did not return a deployment ID" };
  return {
    success: true,
    deploymentId: deploy.id,
    url: deploy.ssl_url || deploy.url || undefined,
    status: providerStatusToDeployStatus("netlify", deploy.state),
  };
}

// ─── Deployment History ─────────────────────────────────────────────────────

export async function getDeploymentHistory(
  userId: number,
  limit = 20
): Promise<DeploymentDto[]> {
  const db = getDb();
  if (!db) return [];
  const { data } = await db
    .from("deployments")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  const records = (data || []) as DeploymentRecord[];
  const refreshedRecords = await Promise.all(
    records.map(async record => {
      if (
        !record.deployment_id ||
        !["queued", "building", "deploying"].includes(record.status)
      ) {
        return record;
      }
      return (await refreshProviderDeployment(record)) || record;
    })
  );
  return refreshedRecords.map(toDeploymentDto);
}

export async function getDeploymentStatus(
  deploymentDbId: number,
  userId: number
): Promise<DeploymentDto | null> {
  const db = getDb();
  if (!db) return null;
  const { data } = await db
    .from("deployments")
    .select("*")
    .eq("id", deploymentDbId)
    .eq("user_id", userId)
    .single();
  if (!data) return null;

  const record = data as DeploymentRecord;
  if (
    !record.deployment_id ||
    !["queued", "building", "deploying"].includes(record.status)
  ) {
    return toDeploymentDto(record);
  }

  const refreshed = await refreshProviderDeployment(record);
  return toDeploymentDto(refreshed || record);
}

async function refreshProviderDeployment(
  record: DeploymentRecord
): Promise<DeploymentRecord | null> {
  if (record.platform !== "vercel" && record.platform !== "netlify")
    return null;

  try {
    const platform = record.platform as Exclude<Platform, "railway">;
    let token = await getPlatformToken(record.user_id, platform);
    if (!token) token = getSystemToken(platform);
    if (!token) return null;

    const provider =
      platform === "vercel"
        ? await getVercelDeployment(token, record.deployment_id!)
        : await getNetlifyDeployment(token, record.deployment_id!);
    if (!provider) return null;

    const db = getDb();
    if (!db) return null;
    const completedAt =
      provider.status === "live" ||
      provider.status === "failed" ||
      provider.status === "cancelled"
        ? new Date().toISOString()
        : null;
    const { data, error } = await db
      .from("deployments")
      .update({
        status: provider.status,
        url: provider.url || record.url,
        error: provider.error || null,
        completed_at: completedAt,
      })
      .eq("id", record.id)
      .eq("user_id", record.user_id)
      .select("*")
      .single();
    if (error || !data) return null;
    return data as DeploymentRecord;
  } catch (error) {
    // A status poll must not turn an otherwise valid deployment into a failure
    // because of a temporary provider/API outage.
    console.warn(
      `[Deploy] Unable to refresh ${record.platform} deployment ${record.deployment_id}:`,
      error
    );
    return null;
  }
}

async function getVercelDeployment(
  token: string,
  deploymentId: string
): Promise<Pick<DeployResult, "status" | "url" | "error"> | null> {
  const res = await fetch(
    `https://api.vercel.com/v13/deployments/${encodeURIComponent(deploymentId)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as any;
  const url = data.url
    ? `https://${data.url}`
    : data.alias?.[0]
      ? `https://${data.alias[0]}`
      : undefined;
  return {
    status: providerStatusToDeployStatus("vercel", data.readyState),
    url,
    error: data.errorMessage || data.error?.message,
  };
}

async function getNetlifyDeployment(
  token: string,
  deploymentId: string
): Promise<Pick<DeployResult, "status" | "url" | "error"> | null> {
  const res = await fetch(
    `https://api.netlify.com/api/v1/deploys/${encodeURIComponent(deploymentId)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as any;
  return {
    status: providerStatusToDeployStatus("netlify", data.state),
    url: data.ssl_url || data.url || undefined,
    error: data.error_message || data.error,
  };
}
