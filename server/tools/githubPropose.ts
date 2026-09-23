import { isCapabilityEnabled } from "../actionCatalog";
import { createGitHubProposal } from "../githubProposalService";
import { registerTool, type ToolContext, type ToolResult } from "./index";

registerTool({
  name: "github_propose_change",
  description:
    "Prepare a reviewable GitHub code-change proposal after inspecting the repository. This stores the exact repository, base branch, new toriu/ branch, commit message, pull-request title/body, and complete file contents inside Quoratorium. It does not contact or modify GitHub. The owner must review and separately confirm the proposal at https://quoratorium.com/workspace/git before any branch or pull request is created.",
  parameters: {
    type: "object",
    properties: {
      repository: {
        type: "string",
        description: "Target repository in owner/repository format.",
      },
      baseBranch: {
        type: "string",
        description:
          "Existing GitHub branch the proposed change will start from.",
      },
      branchSlug: {
        type: "string",
        description:
          "Short descriptive branch slug. Quoratorium enforces the toriu/ prefix and adds a collision-resistant suffix.",
      },
      title: {
        type: "string",
        description: "Proposed pull-request title.",
      },
      body: {
        type: "string",
        description:
          "Proposed pull-request explanation, testing notes, and material impact.",
      },
      commitMessage: {
        type: "string",
        description: "Commit message for the proposed file changes.",
      },
      files: {
        type: "array",
        description:
          "Complete final contents for every file the proposal will create or replace.",
        minItems: 1,
        maxItems: 50,
        items: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Repository-relative file path.",
            },
            content: {
              type: "string",
              description: "Complete proposed file content.",
            },
          },
          required: ["path", "content"],
          additionalProperties: false,
        },
      },
    },
    required: ["repository", "baseBranch", "title", "commitMessage", "files"],
    additionalProperties: false,
  },
  async execute(
    args: Record<string, any>,
    context: ToolContext
  ): Promise<ToolResult> {
    if (!isCapabilityEnabled("github.change.proposal")) {
      return {
        success: false,
        output: "GitHub change proposals are not enabled.",
      };
    }
    const userId = Number(context.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return {
        success: false,
        output:
          "A verified owner session is required to prepare a GitHub proposal.",
      };
    }

    const proposal = await createGitHubProposal({
      userId,
      projectId: context.projectId,
      repository: String(args.repository || ""),
      baseBranch: String(args.baseBranch || ""),
      branchSlug:
        typeof args.branchSlug === "string" ? args.branchSlug : undefined,
      title: String(args.title || ""),
      body: typeof args.body === "string" ? args.body : "",
      commitMessage: String(args.commitMessage || ""),
      files: Array.isArray(args.files) ? args.files : [],
    });

    return {
      success: true,
      output: `GitHub proposal ${proposal.id} is ready for owner review. Nothing was sent to GitHub.\nRepository: ${proposal.repository}\nBase: ${proposal.base_branch}\nProposed branch: ${proposal.branch_name}\nPull request: ${proposal.title}\nFiles: ${proposal.files.map(file => file.path).join(", ")}\nReview and approve it at https://quoratorium.com/workspace/git. The page is registered in the production workspace; do not claim that the approval screen is unavailable.`,
      data: {
        githubProposal: true,
        proposalId: proposal.id,
        repository: proposal.repository,
        branchName: proposal.branch_name,
        status: proposal.status,
        reviewUrl: "https://quoratorium.com/workspace/git",
      },
      artifacts: [
        {
          type: "url",
          name: "Review GitHub proposal",
          url: "https://quoratorium.com/workspace/git",
        },
      ],
    };
  },
});
