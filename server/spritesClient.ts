/**
 * Sprites.dev API Client — Persistent Linux sandboxed environments via Fly.io
 * 
 * Provides: create sprites, execute commands, get status, filesystem access,
 * hibernate/wake on demand.
 */

const SPRITES_API_BASE = "https://api.sprites.dev/v1";

function getToken(): string {
  const token = process.env.SPRITES_TOKEN;
  if (!token) throw new Error("SPRITES_TOKEN not configured");
  return token;
}

function headers(): Record<string, string> {
  return {
    "Authorization": `Bearer ${getToken()}`,
    "Content-Type": "application/json",
  };
}

// ─── Types ─────────────────────────────────────────────────────────────────

export interface Sprite {
  id: string;
  name: string;
  status: "running" | "stopped" | "hibernated" | "creating" | "error";
  region?: string;
  created_at?: string;
  image?: string;
}

export interface ExecResult {
  exit_code: number;
  stdout: string;
  stderr: string;
  duration_ms?: number;
}

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  is_dir: boolean;
  modified?: string;
}

// ─── Sprite Lifecycle ──────────────────────────────────────────────────────

/**
 * Create a new sprite (persistent sandboxed environment)
 */
export async function createSprite(options: {
  name?: string;
  image?: string;
  region?: string;
  size?: string;
} = {}): Promise<Sprite> {
  const body: Record<string, unknown> = {};
  if (options.name) body.name = options.name;
  if (options.image) body.image = options.image;
  if (options.region) body.region = options.region;
  if (options.size) body.size = options.size;

  const res = await fetch(`${SPRITES_API_BASE}/sprites`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create sprite: ${res.status} ${err}`);
  }

  return res.json();
}

/**
 * List all sprites
 */
export async function listSprites(): Promise<Sprite[]> {
  const res = await fetch(`${SPRITES_API_BASE}/sprites`, {
    method: "GET",
    headers: headers(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to list sprites: ${res.status} ${err}`);
  }

  return res.json();
}

/**
 * Get sprite status by name or ID
 */
export async function getSprite(nameOrId: string): Promise<Sprite> {
  const res = await fetch(`${SPRITES_API_BASE}/sprites/${nameOrId}`, {
    method: "GET",
    headers: headers(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to get sprite: ${res.status} ${err}`);
  }

  return res.json();
}

/**
 * Delete a sprite
 */
export async function deleteSprite(nameOrId: string): Promise<void> {
  const res = await fetch(`${SPRITES_API_BASE}/sprites/${nameOrId}`, {
    method: "DELETE",
    headers: headers(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to delete sprite: ${res.status} ${err}`);
  }
}

/**
 * Hibernate a sprite (saves state, reduces cost)
 */
export async function hibernateSprite(nameOrId: string): Promise<void> {
  const res = await fetch(`${SPRITES_API_BASE}/sprites/${nameOrId}/hibernate`, {
    method: "POST",
    headers: headers(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to hibernate sprite: ${res.status} ${err}`);
  }
}

/**
 * Wake a hibernated sprite
 */
export async function wakeSprite(nameOrId: string): Promise<Sprite> {
  const res = await fetch(`${SPRITES_API_BASE}/sprites/${nameOrId}/wake`, {
    method: "POST",
    headers: headers(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to wake sprite: ${res.status} ${err}`);
  }

  return res.json();
}

// ─── Command Execution ─────────────────────────────────────────────────────

/**
 * Execute a command in a sprite
 */
export async function execInSprite(
  nameOrId: string,
  command: string,
  options: {
    timeout_ms?: number;
    workdir?: string;
    env?: Record<string, string>;
  } = {}
): Promise<ExecResult> {
  const body: Record<string, unknown> = { command };
  if (options.timeout_ms) body.timeout_ms = options.timeout_ms;
  if (options.workdir) body.workdir = options.workdir;
  if (options.env) body.env = options.env;

  const res = await fetch(`${SPRITES_API_BASE}/sprites/${nameOrId}/exec`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to exec in sprite: ${res.status} ${err}`);
  }

  return res.json();
}

/**
 * Execute multiple commands sequentially in a sprite
 */
export async function execMultipleInSprite(
  nameOrId: string,
  commands: string[],
  options: { timeout_ms?: number; workdir?: string } = {}
): Promise<ExecResult[]> {
  const results: ExecResult[] = [];
  for (const cmd of commands) {
    const result = await execInSprite(nameOrId, cmd, options);
    results.push(result);
    // Stop on error
    if (result.exit_code !== 0) break;
  }
  return results;
}

// ─── Filesystem ────────────────────────────────────────────────────────────

/**
 * Write a file to a sprite's filesystem
 */
export async function writeFile(
  nameOrId: string,
  path: string,
  content: string
): Promise<void> {
  const res = await fetch(`${SPRITES_API_BASE}/sprites/${nameOrId}/files`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ path, content }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to write file: ${res.status} ${err}`);
  }
}

/**
 * Read a file from a sprite's filesystem
 */
export async function readFile(
  nameOrId: string,
  path: string
): Promise<string> {
  const res = await fetch(`${SPRITES_API_BASE}/sprites/${nameOrId}/files?path=${encodeURIComponent(path)}`, {
    method: "GET",
    headers: headers(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to read file: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.content || "";
}

/**
 * List files in a directory on a sprite
 */
export async function listFiles(
  nameOrId: string,
  path: string = "/"
): Promise<FileInfo[]> {
  const res = await fetch(`${SPRITES_API_BASE}/sprites/${nameOrId}/files/list?path=${encodeURIComponent(path)}`, {
    method: "GET",
    headers: headers(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to list files: ${res.status} ${err}`);
  }

  return res.json();
}

/**
 * Write multiple files to a sprite (batch operation)
 */
export async function writeMultipleFiles(
  nameOrId: string,
  files: Array<{ path: string; content: string }>
): Promise<void> {
  for (const file of files) {
    await writeFile(nameOrId, file.path, file.content);
  }
}

// ─── High-Level Helpers ────────────────────────────────────────────────────

/**
 * Create a sprite, install dependencies, and run code — full execution pipeline
 */
export async function executeCodeInSprite(options: {
  language: "javascript" | "typescript" | "python" | "bash";
  code: string;
  dependencies?: string[];
  spriteName?: string;
}): Promise<{
  sprite: Sprite;
  installResult?: ExecResult;
  execResult: ExecResult;
}> {
  const { language, code, dependencies, spriteName } = options;

  // Create or reuse a sprite
  const name = spriteName || `q-exec-${Date.now()}`;
  let sprite: Sprite;

  try {
    sprite = await getSprite(name);
    if (sprite.status === "hibernated") {
      sprite = await wakeSprite(name);
    }
  } catch {
    sprite = await createSprite({ name });
  }

  // Install dependencies if needed
  let installResult: ExecResult | undefined;
  if (dependencies && dependencies.length > 0) {
    const installCmd = language === "python"
      ? `pip install ${dependencies.join(" ")}`
      : `npm install ${dependencies.join(" ")}`;
    installResult = await execInSprite(name, installCmd, { timeout_ms: 60000 });
  }

  // Write code to file and execute
  let filename: string;
  let execCmd: string;

  switch (language) {
    case "javascript":
      filename = "/tmp/code.js";
      execCmd = `node ${filename}`;
      break;
    case "typescript":
      filename = "/tmp/code.ts";
      execCmd = `npx tsx ${filename}`;
      break;
    case "python":
      filename = "/tmp/code.py";
      execCmd = `python3 ${filename}`;
      break;
    case "bash":
      filename = "/tmp/code.sh";
      execCmd = `bash ${filename}`;
      break;
  }

  await writeFile(name, filename, code);
  const execResult = await execInSprite(name, execCmd, { timeout_ms: 30000 });

  return { sprite, installResult, execResult };
}

/**
 * Build a project in a sprite (install deps + build)
 */
export async function buildProjectInSprite(options: {
  spriteName?: string;
  files: Array<{ path: string; content: string }>;
  installCmd?: string;
  buildCmd?: string;
}): Promise<{
  sprite: Sprite;
  installResult: ExecResult;
  buildResult: ExecResult;
}> {
  const { files, installCmd = "npm install", buildCmd = "npm run build" } = options;
  const name = options.spriteName || `q-build-${Date.now()}`;

  let sprite: Sprite;
  try {
    sprite = await getSprite(name);
    if (sprite.status === "hibernated") {
      sprite = await wakeSprite(name);
    }
  } catch {
    sprite = await createSprite({ name });
  }

  // Write project files
  await writeMultipleFiles(name, files);

  // Install and build
  const workdir = "/app";
  await execInSprite(name, `mkdir -p ${workdir}`, { timeout_ms: 5000 });

  // Write files to /app
  for (const file of files) {
    const fullPath = file.path.startsWith("/") ? file.path : `/app/${file.path}`;
    await writeFile(name, fullPath, file.content);
  }

  const installResult = await execInSprite(name, installCmd, {
    timeout_ms: 120000,
    workdir,
  });

  const buildResult = await execInSprite(name, buildCmd, {
    timeout_ms: 120000,
    workdir,
  });

  return { sprite, installResult, buildResult };
}

/**
 * Get or create a reusable sprite for the workspace
 */
export async function getWorkspaceSprite(): Promise<Sprite> {
  const name = "q-workspace-main";
  try {
    const sprite = await getSprite(name);
    if (sprite.status === "hibernated") {
      return await wakeSprite(name);
    }
    return sprite;
  } catch {
    return await createSprite({ name, image: "ubuntu:22.04" });
  }
}
