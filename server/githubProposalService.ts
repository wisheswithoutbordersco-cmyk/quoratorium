import crypto from "crypto";
import { addOrchestrationEvent } from "./db";
import { createPullRequestFromProposal } from "./githubService";
import { getSupabaseAdmin } from "./supabase";

export type GitHubProposalStatus =
  | "proposed"
  | "executing"
  | "pull_request_opened"
  | "cancelled"
  | "failed";

export interface GitHubProposalFile {
  path: string;
  content: string;
}

export interface GitHubChangeProposal {
  id: string;
  user_id: number;
  project_id: number | null;
  repository: string;
  base_branch: string;
  branch_name: string;
  title: string;
  body: string;
  commit_message: string;
  files: GitHubProposalFile[];
  status: GitHubProposalStatus;
  risk_level: "high";
  confirmation_rule: "always_confirm";
  approved_at: string | null;
  executed_at: string | null;
  pull_request_number: number | null;
  pull_request_url: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

const MAX_FILES = 50;
const MAX_FILE_BYTES = 200_000;
const MAX_TOTAL_BYTES = 1_000_000;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function db() {
  const client = getSupabaseAdmin();
  if (!client) throw new Error("GitHub proposal storage is unavailable.");
  return client;
}

function safeBranchSlug(value: string): string {
  return (
    value
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "change"
  );
}

function proposalBranch(title: string, requested?: string): string {
  const requestedSlug = requested?.replace(/^toriu\//i, "").trim();
  const slug = safeBranchSlug(requestedSlug || title);
  return `toriu/${slug}-${crypto.randomBytes(3).toString("hex")}`;
}

function validateProposalFiles(
  files: GitHubProposalFile[]
): GitHubProposalFile[] {
  if (!Array.isArray(files) || files.length < 1 || files.length > MAX_FILES) {
    throw new Error(
      `A GitHub proposal must include between 1 and ${MAX_FILES} files.`
    );
  }

  let totalBytes = 0;
  const paths = new Set<string>();
  return files.map(file => {
    const path = file.path.trim().replace(/^\/+/, "");
    if (
      !path ||
      path.length > 1024 ||
      path.includes("\\") ||
      path.split("/").some(part => !part || part === "." || part === "..")
    ) {
      throw new Error(`Invalid proposal file path: ${file.path}`);
    }
    if (paths.has(path))
      throw new Error(`Duplicate proposal file path: ${path}`);
    paths.add(path);

    const bytes = Buffer.byteLength(file.content, "utf8");
    if (bytes > MAX_FILE_BYTES) {
      throw new Error(
        `${path} exceeds the ${MAX_FILE_BYTES.toLocaleString()} byte file limit.`
      );
    }
    totalBytes += bytes;
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new Error(
        `Proposal files exceed the ${MAX_TOTAL_BYTES.toLocaleString()} byte total limit.`
      );
    }
    return { path, content: file.content };
  });
}

export async function createGitHubProposal(params: {
  userId: number;
  projectId?: number | null;
  repository: string;
  baseBranch: string;
  branchSlug?: string;
  title: string;
  body?: string;
  commitMessage: string;
  files: GitHubProposalFile[];
}): Promise<GitHubChangeProposal> {
  const repository = params.repository.trim();
  if (!REPOSITORY_PATTERN.test(repository)) {
    throw new Error("Repository must be in owner/repository format.");
  }
  const files = validateProposalFiles(params.files);
  const branchName = proposalBranch(params.title, params.branchSlug);
  const { data, error } = await db()
    .from("github_change_proposals")
    .insert({
      user_id: params.userId,
      project_id: params.projectId || null,
      repository,
      base_branch: params.baseBranch.trim(),
      branch_name: branchName,
      title: params.title.trim(),
      body: params.body?.trim() || "",
      commit_message: params.commitMessage.trim(),
      files,
      status: "proposed",
      risk_level: "high",
      confirmation_rule: "always_confirm",
    })
    .select("*")
    .single();
  if (error)
    throw new Error(`Failed to save GitHub proposal: ${error.message}`);

  try {
    await addOrchestrationEvent({
      user_id: params.userId,
      project_id: params.projectId || null,
      event_type: "github_change_proposed",
      agent_name: "Toríu · GitHub",
      summary: `${repository} · ${params.title.trim()}`,
      payload: {
        capability: "github.change.proposal",
        permission: "propose",
        risk: "medium",
        confirmation: "review_then_confirm",
        proposalId: data.id,
        repository,
        baseBranch: params.baseBranch.trim(),
        branchName,
        filePaths: files.map(file => file.path),
      },
    });
  } catch (auditError: any) {
    console.error(
      "[GitHub] Proposal saved, but orchestration audit failed:",
      auditError?.message || auditError
    );
  }

  return data as GitHubChangeProposal;
}

export async function listGitHubProposals(
  userId: number,
  limit = 30
): Promise<GitHubChangeProposal[]> {
  const { data, error } = await db()
    .from("github_change_proposals")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error)
    throw new Error(`Failed to load GitHub proposals: ${error.message}`);
  return (data || []) as GitHubChangeProposal[];
}

export async function getGitHubProposal(
  userId: number,
  id: string
): Promise<GitHubChangeProposal | null> {
  const { data, error } = await db()
    .from("github_change_proposals")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error)
    throw new Error(`Failed to load GitHub proposal: ${error.message}`);
  return (data as GitHubChangeProposal | null) || null;
}

export async function cancelGitHubProposal(
  userId: number,
  id: string
): Promise<GitHubChangeProposal> {
  const { data, error } = await db()
    .from("github_change_proposals")
    .update({ status: "cancelled", error: null })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("status", "proposed")
    .select("*")
    .single();
  if (error) throw new Error("Only an unexecuted proposal can be cancelled.");

  try {
    await addOrchestrationEvent({
      user_id: userId,
      project_id: data.project_id,
      event_type: "github_change_cancelled",
      agent_name: "Toríu · GitHub",
      summary: `${data.repository} · ${data.title}`,
      payload: { proposalId: data.id, repository: data.repository },
    });
  } catch (auditError: any) {
    console.error(
      "[GitHub] Proposal cancelled, but orchestration audit failed:",
      auditError?.message || auditError
    );
  }
  return data as GitHubChangeProposal;
}

export async function executeApprovedGitHubProposal(
  userId: number,
  id: string
): Promise<GitHubChangeProposal> {
  const { data: claimed, error: claimError } = await db()
    .from("github_change_proposals")
    .update({
      status: "executing",
      approved_at: new Date().toISOString(),
      error: null,
    })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("status", "proposed")
    .select("*")
    .single();

  if (claimError || !claimed) {
    throw new Error("This proposal is no longer awaiting approval.");
  }

  const proposal = claimed as GitHubChangeProposal;
  try {
    await addOrchestrationEvent({
      user_id: userId,
      project_id: proposal.project_id,
      event_type: "github_pull_request_approved",
      agent_name: "Toríu · GitHub",
      summary: `${proposal.repository} · ${proposal.title}`,
      payload: {
        capability: "github.branch_pull_request",
        permission: "write",
        risk: "high",
        confirmation: "always_confirm",
        proposalId: proposal.id,
        repository: proposal.repository,
        baseBranch: proposal.base_branch,
        branchName: proposal.branch_name,
        filePaths: proposal.files.map(file => file.path),
        mergeCapability: "disabled",
      },
    });

    const pullRequest = await createPullRequestFromProposal(userId, {
      repository: proposal.repository,
      baseBranch: proposal.base_branch,
      branchName: proposal.branch_name,
      title: proposal.title,
      body: proposal.body,
      commitMessage: proposal.commit_message,
      files: proposal.files,
    });

    const now = new Date().toISOString();
    const { data, error } = await db()
      .from("github_change_proposals")
      .update({
        status: "pull_request_opened",
        executed_at: now,
        pull_request_number: pullRequest.number,
        pull_request_url: pullRequest.url,
        error: null,
      })
      .eq("id", id)
      .eq("user_id", userId)
      .eq("status", "executing")
      .select("*")
      .single();
    if (error)
      throw new Error(
        `Pull request opened but proposal record update failed: ${error.message}`
      );

    try {
      await addOrchestrationEvent({
        user_id: userId,
        project_id: proposal.project_id,
        event_type: "github_pull_request_opened",
        agent_name: "Toríu · GitHub",
        summary: `${proposal.repository}#${pullRequest.number} · ${proposal.title}`,
        payload: {
          capability: "github.branch_pull_request",
          permission: "write",
          risk: "high",
          confirmation: "always_confirm",
          proposalId: proposal.id,
          repository: proposal.repository,
          baseBranch: proposal.base_branch,
          branchName: proposal.branch_name,
          commitSha: pullRequest.commitSha,
          pullRequestNumber: pullRequest.number,
          pullRequestUrl: pullRequest.url,
          mergeCapability: "disabled",
        },
      });
    } catch (auditError: any) {
      // The approval event was written before GitHub was touched. Never report
      // a completed external action as failed only because the follow-up audit
      // event could not be appended.
      console.error(
        "[GitHub] Pull request opened, but completion audit failed:",
        auditError?.message || auditError
      );
    }

    return data as GitHubChangeProposal;
  } catch (error: any) {
    const message = error?.message || String(error);
    await db()
      .from("github_change_proposals")
      .update({ status: "failed", error: message })
      .eq("id", id)
      .eq("user_id", userId)
      .eq("status", "executing");
    try {
      await addOrchestrationEvent({
        user_id: userId,
        project_id: proposal.project_id,
        event_type: "github_pull_request_failed",
        agent_name: "Toríu · GitHub",
        summary: `${proposal.repository} · ${proposal.title}`,
        payload: {
          capability: "github.branch_pull_request",
          permission: "write",
          risk: "high",
          confirmation: "always_confirm",
          proposalId: proposal.id,
          repository: proposal.repository,
          baseBranch: proposal.base_branch,
          branchName: proposal.branch_name,
          error: message,
          mergeCapability: "disabled",
        },
      });
    } catch (auditError: any) {
      console.error(
        "[GitHub] Failed to record pull-request failure audit:",
        auditError?.message || auditError
      );
    }
    throw error;
  }
}
