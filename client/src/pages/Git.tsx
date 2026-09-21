import { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

type GitFile = { path: string; content: string };

function isValidBranchName(value: string) {
  const name = value.trim();
  if (!name || name.length > 255 || name === "HEAD") return false;
  if (
    name.startsWith("-") ||
    name.startsWith("/") ||
    name.endsWith("/") ||
    name.endsWith(".")
  )
    return false;
  if (
    name.includes("..") ||
    name.includes("@{") ||
    /[~^:?*\\[\\]\\\\\s\x00-\x1f\x7f]/.test(name)
  )
    return false;
  return name
    .split("/")
    .every(
      part => part && part !== "." && part !== ".." && !part.endsWith(".lock")
    );
}

function fileSize(content: string) {
  return new Blob([content]).size.toLocaleString();
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function Git() {
  const { user } = useAuth();

  const [tokenInput, setTokenInput] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [newRepoName, setNewRepoName] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [sourceBranch, setSourceBranch] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedFileIds, setSelectedFileIds] = useState<Set<number>>(
    new Set()
  );
  const [commitMessage, setCommitMessage] = useState("");
  const [pulledFiles, setPulledFiles] = useState<GitFile[] | null>(null);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [showConnectForm, setShowConnectForm] = useState(false);

  const statusQuery = trpc.git.status.useQuery(undefined, { enabled: !!user });
  const isConnected = statusQuery.data?.connected;
  const reposQuery = trpc.git.listRepos.useQuery(undefined, {
    enabled: !!user && !!statusQuery.data?.connected,
  });
  const commitsQuery = trpc.git.commits.useQuery(
    { repo: selectedRepo || "" },
    { enabled: !!selectedRepo }
  );
  const branchesQuery = trpc.git.branches.useQuery(
    { repo: selectedRepo || "" },
    { enabled: !!selectedRepo }
  );
  const projectsQuery = trpc.projects.list.useQuery(undefined, {
    enabled: !!isConnected,
  });
  const projectFilesQuery = trpc.projects.getFiles.useQuery(
    { projectId: Number(selectedProjectId) || 0 },
    { enabled: !!selectedProjectId }
  );
  const pullQuery = trpc.git.pull.useQuery(
    { repo: selectedRepo || "", branch: selectedBranch || undefined },
    { enabled: false, retry: false }
  );

  const selectedRepository = reposQuery.data?.find(
    repo => repo.fullName === selectedRepo
  );
  const defaultBranch =
    selectedRepository?.defaultBranch || branchesQuery.data?.[0]?.name || "";
  const branchNames = useMemo(
    () =>
      Array.from(
        new Set(
          [
            defaultBranch,
            ...(branchesQuery.data?.map(branch => branch.name) || []),
          ].filter(Boolean)
        )
      ),
    [branchesQuery.data, defaultBranch]
  );
  const pushableFiles = useMemo(
    () =>
      (projectFilesQuery.data || []).filter(
        file => typeof file.content === "string" && !!file.filepath
      ),
    [projectFilesQuery.data]
  );
  const selectedFiles = useMemo(
    () => pushableFiles.filter(file => selectedFileIds.has(file.id)),
    [pushableFiles, selectedFileIds]
  );

  useEffect(() => {
    if (
      !selectedRepo &&
      statusQuery.data?.defaultRepo &&
      reposQuery.data?.some(
        repo => repo.fullName === statusQuery.data?.defaultRepo
      )
    ) {
      setSelectedRepo(statusQuery.data.defaultRepo);
    }
  }, [reposQuery.data, selectedRepo, statusQuery.data?.defaultRepo]);

  useEffect(() => {
    if (!selectedRepo) return;
    const repoDefault = selectedRepository?.defaultBranch || "";
    setSelectedBranch(repoDefault);
    setSourceBranch(repoDefault);
    setNewBranchName("");
    setPulledFiles(null);
  }, [selectedRepo]);

  useEffect(() => {
    if (!selectedRepo || !defaultBranch) return;
    setSelectedBranch(current => current || defaultBranch);
    setSourceBranch(current => current || defaultBranch);
  }, [defaultBranch, selectedRepo]);

  useEffect(() => {
    setSelectedFileIds(new Set());
    setCommitMessage("");
  }, [selectedProjectId]);

  useEffect(() => {
    if (projectFilesQuery.data) {
      setSelectedFileIds(new Set(pushableFiles.map(file => file.id)));
    }
  }, [projectFilesQuery.data, pushableFiles]);

  const connectMutation = trpc.git.connect.useMutation({
    onSuccess: data => {
      toast.success(`Connected as ${data.username}`);
      setTokenInput("");
      setShowConnectForm(false);
      statusQuery.refetch();
      reposQuery.refetch();
    },
    onError: err => toast.error(err.message),
  });

  const disconnectMutation = trpc.git.disconnect.useMutation({
    onSuccess: () => {
      toast.success("GitHub disconnected");
      statusQuery.refetch();
    },
  });

  const createRepoMutation = trpc.git.createRepo.useMutation({
    onSuccess: data => {
      toast.success(`${data.fullName} created successfully`);
      setNewRepoName("");
      reposQuery.refetch();
    },
    onError: err => toast.error(err.message),
  });

  const createBranchMutation = trpc.git.createBranch.useMutation({
    onSuccess: data => {
      toast.success(`Branch '${data.name}' created`);
      setNewBranchName("");
      branchesQuery.refetch();
    },
    onError: err => toast.error(err.message),
  });

  const pushMutation = trpc.git.push.useMutation({
    onSuccess: result => {
      toast.success(
        `Pushed ${selectedFiles.length} file${selectedFiles.length === 1 ? "" : "s"}`,
        {
          description: `Commit ${result.commitSha} on ${selectedBranch}`,
        }
      );
    },
    onError: err => toast.error("Push failed", { description: err.message }),
  });

  const branchNameIsValid = isValidBranchName(newBranchName);
  const unavailableProjectFiles =
    (projectFilesQuery.data?.length || 0) - pushableFiles.length;

  const handleCreateBranch = () => {
    if (!selectedRepo || !branchNameIsValid || !sourceBranch) return;
    createBranchMutation.mutate({
      repo: selectedRepo,
      branchName: newBranchName.trim(),
      fromBranch: sourceBranch,
    });
  };

  const handlePush = () => {
    if (
      !selectedRepo ||
      !selectedBranch ||
      !commitMessage.trim() ||
      selectedFiles.length === 0
    )
      return;
    pushMutation.mutate({
      repo: selectedRepo,
      branch: selectedBranch,
      commitMessage: commitMessage.trim(),
      files: selectedFiles.map(file => ({
        path: file.filepath,
        content: file.content as string,
      })),
    });
  };

  const handlePull = async () => {
    if (!selectedRepo || !selectedBranch) return;
    const result = await pullQuery.refetch();
    if (result.error) {
      toast.error("Pull failed", { description: result.error.message });
      return;
    }
    const files = result.data || [];
    setPulledFiles(files);
    toast.success(
      `Fetched ${files.length} file${files.length === 1 ? "" : "s"} for preview`
    );
  };

  const downloadPulledJson = () => {
    if (!pulledFiles || !selectedRepo) return;
    const body = JSON.stringify(
      {
        repository: selectedRepo,
        branch: selectedBranch,
        fetchedAt: new Date().toISOString(),
        files: pulledFiles,
      },
      null,
      2
    );
    downloadBlob(
      new Blob([body], { type: "application/json" }),
      `${selectedRepo.replace("/", "-")}-${selectedBranch}.json`
    );
  };

  const downloadPulledZip = async () => {
    if (!pulledFiles || !selectedRepo) return;
    setIsDownloadingZip(true);
    try {
      const zip = new JSZip();
      pulledFiles.forEach(file => zip.file(file.path, file.content));
      const archive = await zip.generateAsync({ type: "blob" });
      downloadBlob(
        archive,
        `${selectedRepo.replace("/", "-")}-${selectedBranch}.zip`
      );
      toast.success("Downloaded pulled files as ZIP");
    } catch (error) {
      toast.error("Could not create ZIP", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsDownloadingZip(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Back Button */}
        <div className="flex items-center gap-2 mb-4">
          <Link href="/workspace">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground hover:bg-muted/50"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Workspace
            </Button>
          </Link>
        </div>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Git Workspace</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Review project files before pushing and preview fetched files
              before downloading them
            </p>
          </div>
          {isConnected && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                Connected as{" "}
                <span className="text-emerald-400 font-medium">
                  {statusQuery.data?.username}
                </span>
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
                className="text-red-400 border-red-400/30 hover:bg-red-400/10"
              >
                {disconnectMutation.isPending
                  ? "Disconnecting..."
                  : "Disconnect"}
              </Button>
            </div>
          )}
        </div>

        {/* Connection Card */}
        {!isConnected && (
          <Card className="border-border/50 bg-card/50 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-lg">Connect GitHub</CardTitle>
            </CardHeader>
            <CardContent>
              {!showConnectForm ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-zinc-800 flex items-center justify-center">
                    <svg
                      className="w-8 h-8 text-white"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                    </svg>
                  </div>
                  <p className="text-muted-foreground mb-4">
                    Connect your GitHub account to push and pull code
                  </p>
                  <Button onClick={() => setShowConnectForm(true)}>
                    Connect with Personal Access Token
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Create a Personal Access Token at{" "}
                    <a
                      href="https://github.com/settings/tokens"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 underline"
                    >
                      github.com/settings/tokens
                    </a>{" "}
                    with <code className="bg-zinc-800 px-1 rounded">repo</code>{" "}
                    scope.
                  </p>
                  <Input
                    type="password"
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    value={tokenInput}
                    onChange={e => setTokenInput(e.target.value)}
                    className="font-mono"
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={() =>
                        connectMutation.mutate({ token: tokenInput })
                      }
                      disabled={!tokenInput || connectMutation.isPending}
                    >
                      {connectMutation.isPending ? "Connecting..." : "Connect"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowConnectForm(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Main Content (when connected) */}
        {isConnected && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Repos List */}
            <Card className="border-border/50 bg-card/50 backdrop-blur lg:col-span-1">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">Repositories</CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => reposQuery.refetch()}
                >
                  Refresh
                </Button>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[500px] overflow-y-auto">
                {/* Create Repo */}
                <div className="flex gap-2 mb-3">
                  <Input
                    placeholder="New repo name"
                    value={newRepoName}
                    onChange={e => setNewRepoName(e.target.value)}
                    className="text-sm"
                  />
                  <Button
                    size="sm"
                    onClick={() =>
                      createRepoMutation.mutate({ name: newRepoName.trim() })
                    }
                    disabled={
                      !newRepoName.trim() || createRepoMutation.isPending
                    }
                  >
                    {createRepoMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "+"
                    )}
                  </Button>
                </div>

                {reposQuery.data?.map((repo: any) => (
                  <button
                    key={repo.id}
                    onClick={() => setSelectedRepo(repo.fullName)}
                    className={`w-full text-left p-3 rounded-lg border transition-all ${
                      selectedRepo === repo.fullName
                        ? "border-blue-500/50 bg-blue-500/10"
                        : "border-border/30 hover:border-border/60 hover:bg-accent/30"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {repo.name}
                      </span>
                      {repo.private && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                          Private
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      {repo.language && (
                        <span className="text-xs text-muted-foreground">
                          {repo.language}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(repo.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </button>
                ))}

                {reposQuery.isLoading && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Loading repos...
                  </p>
                )}
                {reposQuery.isError && (
                  <p
                    role="alert"
                    className="text-sm text-red-400 text-center py-4"
                  >
                    Could not load repositories: {reposQuery.error.message}
                  </p>
                )}
                {reposQuery.data?.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No repositories yet
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Repo Details */}
            <Card className="border-border/50 bg-card/50 backdrop-blur lg:col-span-2">
              <CardContent className="p-6">
                {!selectedRepo ? (
                  <div className="text-center py-16 text-muted-foreground">
                    <p className="text-lg">Select a repository</p>
                    <p className="text-sm mt-1">
                      Choose a repo from the list to view commits and branches
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Repo Header */}
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-semibold">{selectedRepo}</h2>
                      <a
                        href={`https://github.com/${selectedRepo}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-400 hover:underline"
                      >
                        Open on GitHub →
                      </a>
                    </div>

                    {/* Branches */}
                    <div>
                      <div className="flex flex-col gap-3 mb-3">
                        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                          Branches
                        </h3>
                        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                          <Input
                            placeholder="New branch name"
                            value={newBranchName}
                            onChange={e => setNewBranchName(e.target.value)}
                            aria-invalid={
                              newBranchName.length > 0 && !branchNameIsValid
                            }
                            className="text-sm"
                          />
                          <select
                            aria-label="Source branch"
                            value={sourceBranch}
                            onChange={e => setSourceBranch(e.target.value)}
                            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                            disabled={
                              branchesQuery.isLoading ||
                              branchNames.length === 0
                            }
                          >
                            <option value="">Source branch</option>
                            {branchNames.map(branch => (
                              <option key={branch} value={branch}>
                                {branch}
                                {branch === selectedRepository?.defaultBranch
                                  ? " (default)"
                                  : ""}
                              </option>
                            ))}
                          </select>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleCreateBranch}
                            disabled={
                              !branchNameIsValid ||
                              !sourceBranch ||
                              createBranchMutation.isPending
                            }
                          >
                            {createBranchMutation.isPending
                              ? "Creating..."
                              : "Create branch"}
                          </Button>
                        </div>
                        <p
                          className={`text-xs ${newBranchName && !branchNameIsValid ? "text-red-400" : "text-muted-foreground"}`}
                        >
                          {newBranchName && !branchNameIsValid
                            ? "Use a valid Git branch name (no spaces, .., @\u007b, or special ref characters)."
                            : `New branches start from the selected source${selectedRepository?.defaultBranch ? `; ${selectedRepository.defaultBranch} is this repository's default branch.` : "."}`}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {branchesQuery.data?.map((branch: any) => (
                          <span
                            key={branch.name}
                            className="px-3 py-1 rounded-full text-xs bg-zinc-800 border border-border/30"
                          >
                            {branch.name}
                            {branch.protected && " 🔒"}
                          </span>
                        ))}
                      </div>
                      {branchesQuery.isLoading && (
                        <p className="text-sm text-muted-foreground mt-2">
                          Loading branches...
                        </p>
                      )}
                      {branchesQuery.isError && (
                        <p role="alert" className="text-sm text-red-400 mt-2">
                          Could not load branches: {branchesQuery.error.message}
                        </p>
                      )}
                    </div>

                    {/* Push */}
                    <div className="border border-border/50 rounded-lg p-4 space-y-4">
                      <div>
                        <h3 className="text-sm font-medium">
                          Push project files
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          Select stored project files and review them here
                          before creating a GitHub commit.
                        </p>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="text-sm space-y-1.5">
                          <span className="text-muted-foreground">
                            Workspace project
                          </span>
                          <select
                            value={selectedProjectId}
                            onChange={e => setSelectedProjectId(e.target.value)}
                            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          >
                            <option value="">Select a project</option>
                            {projectsQuery.data?.map(project => (
                              <option key={project.id} value={project.id}>
                                {project.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-sm space-y-1.5">
                          <span className="text-muted-foreground">
                            Destination branch
                          </span>
                          <select
                            value={selectedBranch}
                            onChange={e => setSelectedBranch(e.target.value)}
                            disabled={
                              branchNames.length === 0 ||
                              branchesQuery.isLoading
                            }
                            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
                          >
                            <option value="">Select a branch</option>
                            {branchNames.map(branch => (
                              <option key={branch} value={branch}>
                                {branch}
                                {branch === selectedRepository?.defaultBranch
                                  ? " (default)"
                                  : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      {projectsQuery.isLoading && (
                        <p className="text-xs text-muted-foreground">
                          Loading workspace projects...
                        </p>
                      )}
                      {projectsQuery.isError && (
                        <p role="alert" className="text-xs text-red-400">
                          Could not load projects: {projectsQuery.error.message}
                        </p>
                      )}
                      {selectedProjectId && (
                        <div className="rounded-md border border-border/50">
                          <div className="flex items-center justify-between gap-3 border-b border-border/50 px-3 py-2">
                            <p className="text-xs text-muted-foreground">
                              {projectFilesQuery.isLoading
                                ? "Loading stored files..."
                                : `${selectedFiles.length} of ${pushableFiles.length} file${pushableFiles.length === 1 ? "" : "s"} selected`}
                            </p>
                            {pushableFiles.length > 0 && (
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  className="text-xs text-blue-400 hover:underline"
                                  onClick={() =>
                                    setSelectedFileIds(
                                      new Set(
                                        pushableFiles.map(file => file.id)
                                      )
                                    )
                                  }
                                >
                                  Select all
                                </button>
                                <button
                                  type="button"
                                  className="text-xs text-blue-400 hover:underline"
                                  onClick={() => setSelectedFileIds(new Set())}
                                >
                                  Clear
                                </button>
                              </div>
                            )}
                          </div>
                          <div className="max-h-40 overflow-y-auto divide-y divide-border/30">
                            {pushableFiles.map(file => (
                              <label
                                key={file.id}
                                className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-muted/40"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedFileIds.has(file.id)}
                                  onChange={e =>
                                    setSelectedFileIds(current => {
                                      const next = new Set(current);
                                      if (e.target.checked) next.add(file.id);
                                      else next.delete(file.id);
                                      return next;
                                    })
                                  }
                                />
                                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                <span className="min-w-0 flex-1 truncate font-mono text-xs">
                                  {file.filepath}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {fileSize(file.content as string)} B
                                </span>
                              </label>
                            ))}
                            {!projectFilesQuery.isLoading &&
                              pushableFiles.length === 0 && (
                                <p className="px-3 py-3 text-xs text-muted-foreground">
                                  This project has no stored file content
                                  available to push.
                                </p>
                              )}
                          </div>
                          {unavailableProjectFiles > 0 && (
                            <p className="border-t border-border/50 px-3 py-2 text-xs text-amber-500">
                              {unavailableProjectFiles} file
                              {unavailableProjectFiles === 1 ? "" : "s"}{" "}
                              excluded because this page cannot retrieve its
                              stored text content.
                            </p>
                          )}
                        </div>
                      )}
                      <label className="block text-sm space-y-1.5">
                        <span className="text-muted-foreground">
                          Commit message
                        </span>
                        <textarea
                          value={commitMessage}
                          onChange={e => setCommitMessage(e.target.value)}
                          rows={2}
                          placeholder="Describe the selected project changes"
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        />
                      </label>
                      <Button
                        onClick={handlePush}
                        disabled={
                          !selectedRepo ||
                          !selectedBranch ||
                          !commitMessage.trim() ||
                          selectedFiles.length === 0 ||
                          pushMutation.isPending
                        }
                      >
                        {pushMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Pushing...
                          </>
                        ) : (
                          "Push selected files"
                        )}
                      </Button>
                    </div>

                    {/* Pull */}
                    <div className="border border-border/50 rounded-lg p-4 space-y-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="text-sm font-medium">
                            Pull file preview
                          </h3>
                          <p className="text-xs text-muted-foreground mt-1">
                            Fetching does not change a workspace project. Review
                            the files, then download them locally.
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          onClick={handlePull}
                          disabled={!selectedBranch || pullQuery.isFetching}
                        >
                          {pullQuery.isFetching ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Fetching...
                            </>
                          ) : (
                            "Fetch from GitHub"
                          )}
                        </Button>
                      </div>
                      {pullQuery.isError && !pulledFiles && (
                        <p role="alert" className="text-xs text-red-400">
                          Could not fetch files: {pullQuery.error.message}
                        </p>
                      )}
                      {pulledFiles && (
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs text-muted-foreground">
                              {pulledFiles.length} file
                              {pulledFiles.length === 1 ? "" : "s"} fetched from{" "}
                              <span className="font-mono">
                                {selectedBranch}
                              </span>
                            </p>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={downloadPulledJson}
                              >
                                <Download className="mr-1.5 h-3.5 w-3.5" />
                                JSON
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={downloadPulledZip}
                                disabled={isDownloadingZip}
                              >
                                {isDownloadingZip ? (
                                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Download className="mr-1.5 h-3.5 w-3.5" />
                                )}{" "}
                                ZIP
                              </Button>
                            </div>
                          </div>
                          <div className="max-h-52 overflow-y-auto rounded-md border border-border/50 divide-y divide-border/30">
                            {pulledFiles.map(file => (
                              <details key={file.path} className="group">
                                <summary className="cursor-pointer list-none px-3 py-2 text-sm hover:bg-muted/40">
                                  <span className="font-mono text-xs">
                                    {file.path}
                                  </span>
                                  <span className="ml-2 text-xs text-muted-foreground">
                                    {fileSize(file.content)} B
                                  </span>
                                </summary>
                                <pre className="max-h-56 overflow-auto border-t border-border/30 bg-muted/30 p-3 text-xs">
                                  <code>{file.content}</code>
                                </pre>
                              </details>
                            ))}
                            {pulledFiles.length === 0 && (
                              <p className="px-3 py-3 text-xs text-muted-foreground">
                                This branch did not return any files.
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Commits */}
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
                        Recent Commits
                      </h3>
                      <div className="space-y-2 max-h-[350px] overflow-y-auto">
                        {commitsQuery.data?.map((commit: any) => (
                          <div
                            key={commit.fullSha}
                            className="flex items-start gap-3 p-3 rounded-lg border border-border/20 hover:border-border/40 transition-colors"
                          >
                            <code className="text-xs text-blue-400 font-mono mt-0.5 shrink-0">
                              {commit.sha}
                            </code>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm truncate">
                                {commit.message}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {commit.author} ·{" "}
                                {new Date(commit.date).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        ))}
                        {commitsQuery.isLoading && (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            Loading commits...
                          </p>
                        )}
                        {commitsQuery.isError && (
                          <p
                            role="alert"
                            className="text-sm text-red-400 text-center py-4"
                          >
                            Could not load commits: {commitsQuery.error.message}
                          </p>
                        )}
                        {commitsQuery.data?.length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            No commits yet
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
