import { registerTool, type ToolContext, type ToolResult } from "./index";
import {
  auditGitHubCapability,
  getRepositoryOverview,
  getRepositoryTree,
  listRepos,
  readRepositoryFile,
  searchRepositoryCode,
} from "../githubService";
import { isCapabilityEnabled } from "../actionCatalog";

function ownerId(context: ToolContext): number | null {
  const userId = Number(context.userId);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

function capabilityUnavailable(): ToolResult {
  return {
    success: false,
    output:
      "GitHub repository reading is not currently enabled for this workspace.",
  };
}

function repositoryReadiness(context: ToolContext): number | ToolResult {
  if (!isCapabilityEnabled("github.repository.read"))
    return capabilityUnavailable();
  const userId = ownerId(context);
  if (!userId) {
    return {
      success: false,
      output:
        "A verified owner session is required before Toríu can inspect GitHub repositories.",
    };
  }
  return userId;
}

registerTool({
  name: "github_list_repositories",
  description:
    "List GitHub repositories visible to the connected account. Read-only: this never creates, changes, deletes, merges, or opens pull requests.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
  async execute(
    _args: Record<string, any>,
    context: ToolContext
  ): Promise<ToolResult> {
    const readiness = repositoryReadiness(context);
    if (typeof readiness !== "number") return readiness;

    const repositories = await listRepos(readiness);
    await auditGitHubCapability({
      userId: readiness,
      action: "repository_list",
      resultCount: repositories.length,
      projectId: context.projectId,
    });

    return {
      success: true,
      output: `Found ${repositories.length} GitHub repositories. ${repositories
        .slice(0, 30)
        .map(
          repo =>
            `${repo.fullName} (${repo.defaultBranch || "default branch unknown"})${repo.description ? ` — ${repo.description}` : ""}`
        )
        .join("\n")}`,
      data: { repositories },
    };
  },
});

registerTool({
  name: "github_repository_overview",
  description:
    "Inspect a GitHub repository's summary, default branch, language, topics, and current state. Read-only: never changes the repository.",
  parameters: {
    type: "object",
    properties: {
      repository: {
        type: "string",
        description:
          "Repository in owner/repository format, for example wisheswithoutbordersco-cmyk/quoratorium.",
      },
    },
    required: ["repository"],
    additionalProperties: false,
  },
  async execute(
    args: Record<string, any>,
    context: ToolContext
  ): Promise<ToolResult> {
    const readiness = repositoryReadiness(context);
    if (typeof readiness !== "number") return readiness;
    const repository =
      typeof args.repository === "string" ? args.repository : "";
    const overview = await getRepositoryOverview(
      readiness,
      repository,
      context.projectId
    );

    return {
      success: true,
      output: `${overview.fullName}\nDefault branch: ${overview.defaultBranch}\nLanguage: ${overview.language || "Not detected"}\nVisibility: ${overview.private ? "private" : "public"}\nArchived: ${overview.archived ? "yes" : "no"}\nDescription: ${overview.description || "No description"}\nTopics: ${overview.topics.join(", ") || "None"}\nUpdated: ${overview.updatedAt}`,
      data: { overview },
    };
  },
});

registerTool({
  name: "github_list_repository_files",
  description:
    "List the files and folders in a GitHub repository branch so Toríu can find where code lives. Read-only: never changes the repository.",
  parameters: {
    type: "object",
    properties: {
      repository: {
        type: "string",
        description: "Repository in owner/repository format.",
      },
      reference: {
        type: "string",
        description:
          "Optional branch or commit reference. Omit for the repository default branch.",
      },
    },
    required: ["repository"],
    additionalProperties: false,
  },
  async execute(
    args: Record<string, any>,
    context: ToolContext
  ): Promise<ToolResult> {
    const readiness = repositoryReadiness(context);
    if (typeof readiness !== "number") return readiness;
    const repository =
      typeof args.repository === "string" ? args.repository : "";
    const reference =
      typeof args.reference === "string" ? args.reference : undefined;
    const tree = await getRepositoryTree(
      readiness,
      repository,
      reference,
      context.projectId
    );
    const fileCount = tree.entries.filter(
      entry => entry.type === "file"
    ).length;

    return {
      success: true,
      output: `${tree.repository} @ ${tree.reference}: ${tree.entries.length} entries (${fileCount} files).${tree.truncated ? " The listing was truncated; narrow the request by reading known paths." : ""}\n${tree.entries
        .slice(0, 300)
        .map(
          entry =>
            `${entry.type === "directory" ? "dir" : "file"}  ${entry.path}`
        )
        .join("\n")}`,
      data: { tree },
    };
  },
});

registerTool({
  name: "github_read_repository_file",
  description:
    "Read one text file from a GitHub repository so Toríu can explain existing code. Read-only: never changes the repository.",
  parameters: {
    type: "object",
    properties: {
      repository: {
        type: "string",
        description: "Repository in owner/repository format.",
      },
      path: {
        type: "string",
        description:
          "Repository-relative file path, for example server/routers/git.ts.",
      },
      reference: {
        type: "string",
        description:
          "Optional branch or commit reference. Omit for the repository default branch.",
      },
    },
    required: ["repository", "path"],
    additionalProperties: false,
  },
  async execute(
    args: Record<string, any>,
    context: ToolContext
  ): Promise<ToolResult> {
    const readiness = repositoryReadiness(context);
    if (typeof readiness !== "number") return readiness;
    const repository =
      typeof args.repository === "string" ? args.repository : "";
    const path = typeof args.path === "string" ? args.path : "";
    const reference =
      typeof args.reference === "string" ? args.reference : undefined;
    const file = await readRepositoryFile(
      readiness,
      repository,
      path,
      reference,
      context.projectId
    );

    return {
      success: true,
      output: `${file.repository}/${file.path}${file.reference ? ` @ ${file.reference}` : ""} (${file.size.toLocaleString()} bytes)${file.truncated ? " — output truncated" : ""}\n\n${file.content}`,
      data: {
        repository: file.repository,
        path: file.path,
        reference: file.reference,
        sha: file.sha,
        truncated: file.truncated,
      },
      artifacts: [{ type: "code", name: file.path, content: file.content }],
    };
  },
});

registerTool({
  name: "github_search_repository_code",
  description:
    "Search code paths in one GitHub repository to find where a symbol, feature, or text is defined. Read-only: never changes the repository.",
  parameters: {
    type: "object",
    properties: {
      repository: {
        type: "string",
        description: "Repository in owner/repository format.",
      },
      query: {
        type: "string",
        description:
          "A concise code search query, such as a component name, route, API method, or text fragment.",
      },
    },
    required: ["repository", "query"],
    additionalProperties: false,
  },
  async execute(
    args: Record<string, any>,
    context: ToolContext
  ): Promise<ToolResult> {
    const readiness = repositoryReadiness(context);
    if (typeof readiness !== "number") return readiness;
    const repository =
      typeof args.repository === "string" ? args.repository : "";
    const query = typeof args.query === "string" ? args.query : "";
    const search = await searchRepositoryCode(
      readiness,
      repository,
      query,
      context.projectId
    );

    return {
      success: true,
      output: `${search.repository}: ${search.totalCount} code search match${search.totalCount === 1 ? "" : "es"} for “${search.query}”.\n${
        search.results
          .map(result => `${result.path} — ${result.url}`)
          .join("\n") || "No matching code paths found."
      }`,
      data: { search },
    };
  },
});
