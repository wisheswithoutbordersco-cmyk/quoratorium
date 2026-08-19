/**
 * Sandbox Project Store
 * 
 * Manages sandboxed project files for Captain Q's autonomous deployments.
 * Each user gets a sandbox with files that can be deployed to a live URL.
 * 
 * Architecture:
 * - Files stored in-memory for fast access during a session
 * - Persisted to Supabase for durability across restarts
 * - Served via an Express route at /sandbox/:sandboxId/*
 * - Each sandbox gets a unique ID that maps to a live preview URL
 */
import { randomUUID } from "crypto";
import { getSupabaseAdmin } from "../supabase";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SandboxFile {
  filename: string;
  content: string;
  language: string;
  updatedAt: number;
}

interface Sandbox {
  id: string;
  userId: string;
  projectId: number | null;
  files: Map<string, SandboxFile>;
  createdAt: number;
  deployedAt?: number;
}

// ─── In-Memory Store ────────────────────────────────────────────────────────

const sandboxes: Map<string, Sandbox> = new Map();
const userSandboxMap: Map<string, string> = new Map(); // userId → most recent sandboxId

// ─── Core Operations ────────────────────────────────────────────────────────

/**
 * Add a file to the user's current sandbox (creates sandbox if needed)
 */
export async function addFileToSandbox(
  userId: string,
  projectId: number | null,
  filename: string,
  content: string,
  language?: string,
): Promise<{ sandboxId: string; filename: string }> {
  let sandboxId = userSandboxMap.get(userId);
  let sandbox: Sandbox;

  if (sandboxId && sandboxes.has(sandboxId)) {
    sandbox = sandboxes.get(sandboxId)!;
  } else {
    // Create new sandbox
    sandboxId = `sb-${randomUUID().slice(0, 8)}`;
    sandbox = {
      id: sandboxId,
      userId,
      projectId,
      files: new Map(),
      createdAt: Date.now(),
    };
    sandboxes.set(sandboxId, sandbox);
    userSandboxMap.set(userId, sandboxId);
  }

  // Add/update file
  sandbox.files.set(filename, {
    filename,
    content,
    language: language || inferLang(filename),
    updatedAt: Date.now(),
  });

  // Persist to Supabase (non-blocking)
  persistSandbox(sandbox).catch(() => {});

  return { sandboxId, filename };
}

/**
 * Get a file from a sandbox
 */
export function getSandboxFile(sandboxId: string, filename: string): SandboxFile | null {
  const sandbox = sandboxes.get(sandboxId);
  if (!sandbox) return null;
  return sandbox.files.get(filename) || null;
}

/**
 * Get all files in a sandbox
 */
export function getSandboxFiles(sandboxId: string): SandboxFile[] {
  const sandbox = sandboxes.get(sandboxId);
  if (!sandbox) return [];
  return Array.from(sandbox.files.values());
}

/**
 * Get the user's current sandbox ID
 */
export function getUserSandboxId(userId: string): string | undefined {
  return userSandboxMap.get(userId);
}

/**
 * Deploy a sandbox (marks it as deployed and returns the URL info)
 */
export async function deploySandbox(
  userId: string,
  sandboxId?: string,
): Promise<{ success: boolean; sandboxId?: string; error?: string }> {
  const targetId = sandboxId || userSandboxMap.get(userId);
  if (!targetId) {
    return { success: false, error: "No sandbox found. Create files first." };
  }

  const sandbox = sandboxes.get(targetId);
  if (!sandbox) {
    return { success: false, error: `Sandbox ${targetId} not found.` };
  }

  if (sandbox.files.size === 0) {
    return { success: false, error: "Sandbox has no files to deploy." };
  }

  sandbox.deployedAt = Date.now();

  // Persist deployment state
  persistSandbox(sandbox).catch(() => {});

  return { success: true, sandboxId: targetId };
}

/**
 * Get the live URL for a sandbox
 */
export function getSandboxUrl(sandboxId: string): string {
  // Return full URL so frontend can display it correctly
  const baseUrl = process.env.NODE_ENV === "production" 
    ? "https://quoratorium.com" 
    : "http://localhost:3000";
  return `${baseUrl}/sandbox/${sandboxId}/`;
}

/**
 * Serve a sandbox file (called by the Express route handler)
 */
export function serveSandboxFile(sandboxId: string, path: string): { content: string; contentType: string } | null {
  const sandbox = sandboxes.get(sandboxId);
  if (!sandbox) return null;

  // Normalize path
  let filename = path.replace(/^\/+/, "") || "index.html";

  // Try exact match first
  let file = sandbox.files.get(filename);

  // Try with index.html appended if directory-like
  if (!file && !filename.includes(".")) {
    file = sandbox.files.get(`${filename}/index.html`) || sandbox.files.get("index.html");
  }

  if (!file) return null;

  return {
    content: file.content,
    contentType: getContentType(file.filename),
  };
}

/**
 * Load sandbox from Supabase (for server restarts)
 */
export async function loadSandboxFromStore(sandboxId: string): Promise<boolean> {
  if (sandboxes.has(sandboxId)) return true;

  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  const { data } = await supabase
    .from("sandboxes")
    .select("*")
    .eq("id", sandboxId)
    .single();

  if (!data) return false;

  const files = new Map<string, SandboxFile>();
  const fileData = (data.files || []) as any[];
  for (const f of fileData) {
    files.set(f.filename, {
      filename: f.filename,
      content: f.content,
      language: f.language || "text",
      updatedAt: f.updatedAt || Date.now(),
    });
  }

  sandboxes.set(sandboxId, {
    id: sandboxId,
    userId: data.user_id,
    projectId: data.project_id,
    files,
    createdAt: data.created_at ? new Date(data.created_at).getTime() : Date.now(),
    deployedAt: data.deployed_at ? new Date(data.deployed_at).getTime() : undefined,
  });

  userSandboxMap.set(data.user_id, sandboxId);
  return true;
}

// ─── Persistence ────────────────────────────────────────────────────────────

async function persistSandbox(sandbox: Sandbox): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const fileArray = Array.from(sandbox.files.values()).map((f) => ({
    filename: f.filename,
    content: f.content,
    language: f.language,
    updatedAt: f.updatedAt,
  }));

  await supabase.from("sandboxes").upsert({
    id: sandbox.id,
    user_id: sandbox.userId,
    project_id: sandbox.projectId,
    files: fileArray,
    deployed_at: sandbox.deployedAt ? new Date(sandbox.deployedAt).toISOString() : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function inferLang(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    html: "html", htm: "html", css: "css", js: "javascript",
    ts: "typescript", tsx: "tsx", jsx: "jsx", py: "python",
    json: "json", md: "markdown", svg: "svg",
  };
  return map[ext] || "text";
}

function getContentType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    html: "text/html",
    htm: "text/html",
    css: "text/css",
    js: "application/javascript",
    mjs: "application/javascript",
    ts: "application/typescript",
    json: "application/json",
    svg: "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    gif: "image/gif",
    ico: "image/x-icon",
    txt: "text/plain",
    md: "text/markdown",
  };
  return map[ext] || "text/plain";
}
