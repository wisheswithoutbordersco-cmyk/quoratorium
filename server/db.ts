/**
 * Q Workspace — Database Layer (Supabase Postgres)
 * 
 * All queries use the Supabase admin client (service_role key, bypasses RLS).
 * Tables use snake_case column names in Postgres.
 */
import { getSupabaseAdmin } from "./supabase";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface User {
  id: number;
  clerk_id: string;
  name: string | null;
  email: string | null;
  login_method: string | null;
  role: "user" | "admin";
  created_at: string;
  updated_at: string;
  last_signed_in: string;
}

export interface Project {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  project_type: string;
  status: string;
  current_phase: number;
  total_phases: number;
  phases: any;
  metadata: any;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: number;
  user_id: number;
  title: string | null;
  project_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: number;
  conversation_id: number;
  user_id: number;
  role: "user" | "assistant" | "system";
  content: string;
  metadata: any;
  created_at: string;
}

export interface MemoryEntry {
  id: number;
  user_id: number;
  category: string;
  title: string;
  content: string;
  tags: string[] | null;
  importance: number;
  source: string;
  related_project_id: number | null;
  use_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface VaultEntry {
  id: number;
  user_id: number;
  name: string;
  entry_type: string;
  content: string | null;
  file_url: string | null;
  file_key: string | null;
  mime_type: string | null;
  metadata: any;
  created_at: string;
  updated_at: string;
}

export interface GeneratedFile {
  id: number;
  project_id: number;
  user_id: number;
  filename: string;
  filepath: string;
  content: string | null;
  file_url: string | null;
  file_key: string | null;
  mime_type: string | null;
  language: string | null;
  created_at: string;
}

export interface OrchestrationEvent {
  id: number;
  project_id: number | null;
  user_id: number;
  event_type: string;
  agent_name: string | null;
  summary: string | null;
  payload: any;
  created_at: string;
}

export interface Job {
  id: string;
  user_id: number;
  type: string;
  status: string;
  priority: string;
  payload: any;
  result: any;
  error: string | null;
  progress: number;
  retries: number;
  max_retries: number;
  timeout: number;
  project_id: number | null;
  parent_job_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface Budget {
  id: number;
  user_id: number;
  type: string;
  limit_usd: string;
  current_spend: string;
  reset_at: string;
  created_at: string;
  updated_at: string;
}

export interface ApiCallRow {
  id: number;
  user_id: number;
  model: string;
  worker: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: string;
  job_id: string | null;
  project_id: number | null;
  duration_ms: number | null;
  success: number;
  metadata: any;
  created_at: string;
}

export interface CostAlert {
  id: number;
  user_id: number;
  type: string;
  message: string;
  threshold: string | null;
  metadata: any;
  triggered_at: string;
}

export interface DocumentRow {
  id: number;
  user_id: number;
  filename: string;
  mime_type: string;
  file_size: number;
  chunk_count: number;
  status: string;
  error_message: string | null;
  storage_key: string | null;
  metadata: any;
  created_at: string;
  updated_at: string;
}

export interface ChunkRow {
  id: number;
  document_id: number;
  user_id: number;
  content: string;
  chunk_index: number;
  token_count: number;
  embedding: string | null;
  metadata: any;
  created_at: string;
}

export interface UserSetting {
  id: number;
  user_id: number;
  key: string;
  value: string | null;
  updated_at: string;
}

export interface GithubConnection {
  id: number;
  user_id: number;
  token_encrypted: string;
  username: string | null;
  default_repo: string | null;
  default_branch: string | null;
  connected_at: string;
  updated_at: string;
}

export interface SharedProject {
  id: number;
  project_id: number;
  user_id: number;
  slug: string;
  title: string | null;
  description: string | null;
  is_active: boolean;
  view_count: number;
  created_at: string;
}

export interface Deployment {
  id: number;
  project_id: number;
  user_id: number;
  platform: string;
  status: string;
  url: string | null;
  deployment_id: string | null;
  project_name: string | null;
  branch: string | null;
  commit_message: string | null;
  logs: string | null;
  error: string | null;
  metadata: any;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface PlatformConnection {
  id: number;
  user_id: number;
  platform: string;
  token_encrypted: string;
  username: string | null;
  team_id: string | null;
  metadata: any;
  connected_at: string;
  updated_at: string;
}

// ─── Helper to get Supabase client (throws if not configured) ────────────────

function getDb() {
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase not configured");
  return client;
}

function getDbOrNull() {
  return getSupabaseAdmin();
}

// ─── Users ──────────────────────────────────────────────────────────────────

export async function upsertUser(user: {
  clerkId: string;
  name?: string | null;
  email?: string | null;
  loginMethod?: string | null;
  lastSignedIn?: Date;
  role?: "user" | "admin";
}): Promise<void> {
  const db = getDbOrNull();
  if (!db) { console.warn("[Database] Cannot upsert user: Supabase not available"); return; }

  const { data: existing } = await db
    .from("users")
    .select("id")
    .eq("clerk_id", user.clerkId)
    .limit(1)
    .single();

  if (existing) {
    // Update existing user
    const updateData: Record<string, any> = {};
    if (user.name !== undefined) updateData.name = user.name;
    if (user.email !== undefined) updateData.email = user.email;
    if (user.loginMethod !== undefined) updateData.login_method = user.loginMethod;
    if (user.lastSignedIn !== undefined) updateData.last_signed_in = user.lastSignedIn.toISOString();
    if (user.role !== undefined) updateData.role = user.role;
    if (Object.keys(updateData).length === 0) updateData.last_signed_in = new Date().toISOString();

    await db.from("users").update(updateData).eq("clerk_id", user.clerkId);
  } else {
    // Insert new user
    await db.from("users").insert({
      clerk_id: user.clerkId,
      name: user.name || null,
      email: user.email || null,
      login_method: user.loginMethod || "clerk",
      role: user.role || "user",
      last_signed_in: (user.lastSignedIn || new Date()).toISOString(),
    });
  }
}

export async function getUserByClerkId(clerkId: string): Promise<User | undefined> {
  const db = getDbOrNull();
  if (!db) return undefined;
  const { data } = await db
    .from("users")
    .select("*")
    .eq("clerk_id", clerkId)
    .limit(1)
    .single();
  return data || undefined;
}

// Legacy alias for backward compatibility
export const getUserByOpenId = getUserByClerkId;

export async function getUserById(id: number): Promise<User | undefined> {
  const db = getDbOrNull();
  if (!db) return undefined;
  const { data } = await db
    .from("users")
    .select("*")
    .eq("id", id)
    .limit(1)
    .single();
  return data || undefined;
}

// ─── Projects ───────────────────────────────────────────────────────────────

export async function createProject(data: {
  user_id: number;
  name: string;
  description?: string | null;
  project_type?: string;
  status?: string;
  current_phase?: number;
  total_phases?: number;
  phases?: any;
  metadata?: any;
}): Promise<Project> {
  const db = getDb();
  const { data: row, error } = await db
    .from("projects")
    .insert({
      user_id: data.user_id,
      name: data.name,
      description: data.description || null,
      project_type: data.project_type || "other",
      status: data.status || "active",
      current_phase: data.current_phase || 1,
      total_phases: data.total_phases || 16,
      phases: data.phases || null,
      metadata: data.metadata || null,
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to create project: ${error.message}`);
  return row;
}

export async function getUserProjects(userId: number): Promise<Project[]> {
  const db = getDbOrNull();
  if (!db) return [];
  const { data } = await db
    .from("projects")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  return data || [];
}

export async function getProject(id: number, userId: number): Promise<Project | undefined> {
  const db = getDbOrNull();
  if (!db) return undefined;
  const { data } = await db
    .from("projects")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .limit(1)
    .single();
  return data || undefined;
}

export async function updateProject(id: number, userId: number, data: Partial<{
  name: string;
  description: string | null;
  project_type: string;
  status: string;
  current_phase: number;
  total_phases: number;
  phases: any;
  metadata: any;
}>): Promise<Project | undefined> {
  const db = getDb();
  const { error } = await db
    .from("projects")
    .update(data)
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(`Failed to update project: ${error.message}`);
  const { data: row } = await db.from("projects").select("*").eq("id", id).single();
  return row || undefined;
}

// ─── Conversations ──────────────────────────────────────────────────────────

export async function addConversationMessage(data: {
  userId: number;
  conversationId: number;
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: any;
}): Promise<number> {
  const db = getDb();
  const { data: row, error } = await db
    .from("messages")
    .insert({
      conversation_id: data.conversationId,
      user_id: data.userId,
      role: data.role,
      content: data.content,
      metadata: data.metadata || null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Failed to add message: ${error.message}`);
  return row.id;
}

export async function getConversationHistory(userId: number, projectId?: number | null, limit = 50): Promise<Message[]> {
  const db = getDbOrNull();
  if (!db) return [];

  let query = db.from("conversations").select("*").eq("user_id", userId);
  if (projectId) query = query.eq("project_id", projectId);
  const { data: convs } = await query.order("created_at", { ascending: false }).limit(5);

  if (!convs || convs.length === 0) return [];
  const latestConv = convs[0];

  const { data: msgs } = await db
    .from("messages")
    .select("*")
    .eq("conversation_id", latestConv.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (msgs || []).reverse();
}

// ─── Memory ─────────────────────────────────────────────────────────────────

export async function createMemoryEntry(data: {
  user_id: number;
  category?: string;
  title: string;
  content: string;
  tags?: string[] | null;
  importance?: number;
  source?: string;
  related_project_id?: number | null;
}): Promise<MemoryEntry> {
  const db = getDb();
  const { data: row, error } = await db
    .from("memory_entries")
    .insert({
      user_id: data.user_id,
      category: data.category || "context",
      title: data.title,
      content: data.content,
      tags: data.tags || null,
      importance: data.importance || 5,
      source: data.source || "manual",
      related_project_id: data.related_project_id || null,
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to create memory: ${error.message}`);
  return row;
}

export async function getUserMemory(userId: number): Promise<MemoryEntry[]> {
  const db = getDbOrNull();
  if (!db) return [];
  const { data } = await db
    .from("memory_entries")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  return data || [];
}

export async function deleteMemoryEntry(id: number, userId: number): Promise<void> {
  const db = getDb();
  await db.from("memory_entries").delete().eq("id", id).eq("user_id", userId);
}

// ─── Vault ──────────────────────────────────────────────────────────────────

export async function createVaultEntry(data: {
  user_id: number;
  name: string;
  entry_type?: string;
  content?: string | null;
  file_url?: string | null;
  file_key?: string | null;
  mime_type?: string | null;
  metadata?: any;
}): Promise<VaultEntry> {
  const db = getDb();
  const { data: row, error } = await db
    .from("vault_entries")
    .insert({
      user_id: data.user_id,
      name: data.name,
      entry_type: data.entry_type || "file",
      content: data.content || null,
      file_url: data.file_url || null,
      file_key: data.file_key || null,
      mime_type: data.mime_type || null,
      metadata: data.metadata || null,
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to create vault entry: ${error.message}`);
  return row;
}

export async function getUserVault(userId: number): Promise<VaultEntry[]> {
  const db = getDbOrNull();
  if (!db) return [];
  const { data } = await db
    .from("vault_entries")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  return data || [];
}

export async function deleteVaultEntry(id: number, userId: number): Promise<void> {
  const db = getDb();
  await db.from("vault_entries").delete().eq("id", id).eq("user_id", userId);
}

// ─── Generated Files ────────────────────────────────────────────────────────

export async function createGeneratedFile(data: {
  project_id: number;
  user_id: number;
  filename: string;
  filepath: string;
  content?: string | null;
  file_url?: string | null;
  file_key?: string | null;
  mime_type?: string | null;
  language?: string | null;
}): Promise<number> {
  const db = getDb();
  const { data: row, error } = await db
    .from("generated_files")
    .insert({
      project_id: data.project_id,
      user_id: data.user_id,
      filename: data.filename,
      filepath: data.filepath,
      content: data.content || null,
      file_url: data.file_url || null,
      file_key: data.file_key || null,
      mime_type: data.mime_type || null,
      language: data.language || null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Failed to create file: ${error.message}`);
  return row.id;
}

export async function getProjectFiles(projectId: number, userId: number): Promise<GeneratedFile[]> {
  const db = getDbOrNull();
  if (!db) return [];
  const { data } = await db
    .from("generated_files")
    .select("*")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return data || [];
}

// ─── Orchestration Events ───────────────────────────────────────────────────

export async function addOrchestrationEvent(data: {
  project_id?: number | null;
  user_id: number;
  event_type: string;
  agent_name?: string | null;
  summary?: string | null;
  payload?: any;
}): Promise<number> {
  const db = getDb();
  const { data: row, error } = await db
    .from("orchestration_events")
    .insert({
      project_id: data.project_id || null,
      user_id: data.user_id,
      event_type: data.event_type,
      agent_name: data.agent_name || null,
      summary: data.summary || null,
      payload: data.payload || null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Failed to add event: ${error.message}`);
  return row.id;
}

export async function getProjectOrchestrationEvents(projectId: number, userId: number, limit = 30): Promise<OrchestrationEvent[]> {
  const db = getDbOrNull();
  if (!db) return [];
  const { data } = await db
    .from("orchestration_events")
    .select("*")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data || [];
}
