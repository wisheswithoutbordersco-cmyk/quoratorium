import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  FileCode2,
  FileSearch,
  FolderTree,
  GitBranch,
  GitPullRequest,
  Loader2,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

type TreeEntry = {
  path: string;
  type: "file" | "directory";
  size: number | null;
  sha: string;
};

function fileSize(size: number | null) {
  if (size === null) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Git() {
  const { user } = useAuth();
  const [tokenInput, setTokenInput] = useState("");
  const [showConnectForm, setShowConnectForm] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [pathFilter, setPathFilter] = useState("");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const utils = trpc.useUtils();

  const statusQuery = trpc.git.status.useQuery(undefined, { enabled: !!user });
  const connected = Boolean(statusQuery.data?.connected);
  const repositoriesQuery = trpc.git.listRepos.useQuery(undefined, {
    enabled: !!user && connected,
  });
  const capabilitiesQuery = trpc.git.capabilities.useQuery(undefined, {
    enabled: !!user,
  });
  const overviewQuery = trpc.git.overview.useQuery(
    { repo: selectedRepo || "" },
    { enabled: !!selectedRepo }
  );
  const branchesQuery = trpc.git.branches.useQuery(
    { repo: selectedRepo || "" },
    { enabled: !!selectedRepo }
  );
  const treeQuery = trpc.git.tree.useQuery(
    { repo: selectedRepo || "", reference: selectedBranch || undefined },
    { enabled: !!selectedRepo && !!selectedBranch }
  );
  const fileQuery = trpc.git.readFile.useQuery(
    {
      repo: selectedRepo || "",
      path: selectedPath || "",
      reference: selectedBranch || undefined,
    },
    { enabled: !!selectedRepo && !!selectedPath }
  );
  const codeSearchQuery = trpc.git.searchCode.useQuery(
    { repo: selectedRepo || "", query: submittedSearch },
    { enabled: !!selectedRepo && submittedSearch.length >= 2, retry: false }
  );

  const connectMutation = trpc.git.connect.useMutation({
    onSuccess: async data => {
      toast.success(`Connected as ${data.username}`);
      setTokenInput("");
      setShowConnectForm(false);
      await Promise.all([
        utils.git.status.invalidate(),
        utils.git.listRepos.invalidate(),
      ]);
    },
    onError: error => toast.error(error.message),
  });
  const disconnectMutation = trpc.git.disconnect.useMutation({
    onSuccess: async () => {
      toast.success("GitHub connection removed");
      setSelectedRepo(null);
      await Promise.all([
        utils.git.status.invalidate(),
        utils.git.listRepos.invalidate(),
      ]);
    },
    onError: error => toast.error(error.message),
  });

  const selectedRepository = repositoriesQuery.data?.find(
    repository => repository.fullName === selectedRepo
  );
  const branchNames = useMemo(
    () => branchesQuery.data?.map(branch => branch.name) || [],
    [branchesQuery.data]
  );
  const visibleEntries = useMemo(() => {
    const filter = pathFilter.trim().toLowerCase();
    return (treeQuery.data?.entries || []).filter(
      entry => !filter || entry.path.toLowerCase().includes(filter)
    );
  }, [pathFilter, treeQuery.data?.entries]);
  const readCapability = capabilitiesQuery.data?.find(
    capability => capability.id === "github.repository.read"
  );

  useEffect(() => {
    if (
      !selectedRepo &&
      statusQuery.data?.defaultRepo &&
      repositoriesQuery.data?.some(
        repository => repository.fullName === statusQuery.data?.defaultRepo
      )
    ) {
      setSelectedRepo(statusQuery.data.defaultRepo);
    }
  }, [repositoriesQuery.data, selectedRepo, statusQuery.data?.defaultRepo]);

  useEffect(() => {
    if (!selectedRepo) return;
    setSelectedPath(null);
    setSubmittedSearch("");
    setSearchInput("");
    setPathFilter("");
  }, [selectedRepo]);

  useEffect(() => {
    const defaultBranch =
      overviewQuery.data?.defaultBranch || branchNames[0] || "";
    if (selectedRepo && defaultBranch && !selectedBranch) {
      setSelectedBranch(defaultBranch);
    }
  }, [
    branchNames,
    overviewQuery.data?.defaultBranch,
    selectedBranch,
    selectedRepo,
  ]);

  const selectRepository = (repo: string) => {
    setSelectedRepo(repo);
    setSelectedBranch("");
  };

  const refreshExplorer = async () => {
    await Promise.all([
      repositoriesQuery.refetch(),
      selectedRepo ? overviewQuery.refetch() : Promise.resolve(),
      selectedRepo ? branchesQuery.refetch() : Promise.resolve(),
      selectedRepo && selectedBranch ? treeQuery.refetch() : Promise.resolve(),
    ]);
    toast.success("GitHub explorer refreshed");
  };

  const runSearch = () => {
    const query = searchInput.trim();
    if (query.length < 2) {
      toast.error("Enter at least two characters to search code.");
      return;
    }
    setSubmittedSearch(query);
  };

  return (
    <div className="min-h-screen bg-background p-4 text-foreground md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center gap-2">
          <Link href="/workspace">
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Workspace
            </Button>
          </Link>
        </div>

        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Toríu GitHub Connection
            </p>
            <h1 className="text-3xl font-bold tracking-tight">
              Repository Explorer
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Toríu can now see your codebase, explain what it does, and find
              where things live. This phase is read-only.
            </p>
          </div>
          {connected && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void refreshExplorer()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
              <Button
                variant="outline"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
                className="border-destructive/40 text-destructive hover:bg-destructive/10"
              >
                {disconnectMutation.isPending ? "Disconnecting…" : "Disconnect"}
              </Button>
            </div>
          )}
        </div>

        <Card className="border-primary/20 bg-primary/[0.035]">
          <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
              <div>
                <p className="font-medium">Read-only GitHub access is active</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Repository listing, structure, code search, file reading, and
                  commit history are audited. Toríu cannot create repositories,
                  push files, merge code, or change GitHub settings from this
                  explorer.
                </p>
              </div>
            </div>
            {readCapability && (
              <div className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300">
                {readCapability.permission} · {readCapability.risk} risk · no
                confirmation
              </div>
            )}
          </CardContent>
        </Card>

        {!connected && (
          <Card className="border-border/50 bg-card/50">
            <CardHeader>
              <CardTitle>Connect GitHub</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!showConnectForm ? (
                <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="max-w-2xl text-sm text-muted-foreground">
                    Connect the account Toríu should read. The token is
                    encrypted server-side and used only by the GitHub service.
                  </p>
                  <Button onClick={() => setShowConnectForm(true)}>
                    Connect GitHub
                  </Button>
                </div>
              ) : (
                <div className="max-w-xl space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Paste a GitHub personal access token that can read the
                    repositories you want Toríu to inspect.
                  </p>
                  <Input
                    type="password"
                    value={tokenInput}
                    onChange={event => setTokenInput(event.target.value)}
                    placeholder="GitHub personal access token"
                    autoComplete="off"
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={() =>
                        connectMutation.mutate({ token: tokenInput })
                      }
                      disabled={!tokenInput || connectMutation.isPending}
                    >
                      {connectMutation.isPending ? "Connecting…" : "Connect"}
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

        {connected && (
          <div className="grid gap-6 xl:grid-cols-[minmax(250px,0.7fr)_minmax(0,1.5fr)]">
            <Card className="border-border/50 bg-card/50">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">Repositories</CardTitle>
                <span className="text-xs text-muted-foreground">
                  {repositoriesQuery.data?.length || 0} visible
                </span>
              </CardHeader>
              <CardContent className="max-h-[680px] space-y-2 overflow-y-auto">
                {repositoriesQuery.data?.map(repository => (
                  <button
                    key={repository.id}
                    type="button"
                    onClick={() => selectRepository(repository.fullName)}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${
                      selectedRepo === repository.fullName
                        ? "border-primary/50 bg-primary/10"
                        : "border-border/40 hover:border-border hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {repository.name}
                      </span>
                      {repository.private && (
                        <LockKeyhole className="h-3.5 w-3.5 text-amber-300" />
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {repository.description || "No repository description"}
                    </p>
                    <p className="mt-2 font-mono text-[10px] text-muted-foreground/80">
                      {repository.defaultBranch || "default branch unknown"}
                    </p>
                  </button>
                ))}
                {repositoriesQuery.isLoading && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Loading repositories…
                  </p>
                )}
                {repositoriesQuery.isError && (
                  <p
                    role="alert"
                    className="py-8 text-center text-sm text-destructive"
                  >
                    Could not load repositories:{" "}
                    {repositoriesQuery.error.message}
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="space-y-6">
              {!selectedRepo ? (
                <Card className="border-border/50 bg-card/50">
                  <CardContent className="py-20 text-center text-muted-foreground">
                    <BookOpen className="mx-auto mb-3 h-8 w-8 opacity-50" />
                    Select a repository to inspect its codebase.
                  </CardContent>
                </Card>
              ) : (
                <>
                  <Card className="border-border/50 bg-card/50">
                    <CardContent className="space-y-4 p-5">
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                        <div>
                          <h2 className="text-xl font-semibold">
                            {selectedRepo}
                          </h2>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {overviewQuery.data?.description ||
                              selectedRepository?.description ||
                              "No repository description"}
                          </p>
                        </div>
                        <a
                          href={`https://github.com/${selectedRepo}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-primary hover:underline"
                        >
                          Open on GitHub →
                        </a>
                      </div>
                      <div className="grid gap-3 text-sm sm:grid-cols-3">
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Default branch
                          </p>
                          <p className="mt-1 font-mono">
                            {overviewQuery.data?.defaultBranch || "Loading…"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Primary language
                          </p>
                          <p className="mt-1">
                            {overviewQuery.data?.language || "Not detected"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Updated
                          </p>
                          <p className="mt-1">
                            {overviewQuery.data?.updatedAt
                              ? new Date(
                                  overviewQuery.data.updatedAt
                                ).toLocaleDateString()
                              : "Loading…"}
                          </p>
                        </div>
                      </div>
                      <label className="block text-sm">
                        <span className="mb-1.5 block text-xs text-muted-foreground">
                          Inspect branch
                        </span>
                        <select
                          value={selectedBranch}
                          onChange={event => {
                            setSelectedBranch(event.target.value);
                            setSelectedPath(null);
                          }}
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          disabled={branchesQuery.isLoading}
                        >
                          {branchNames.map(branch => (
                            <option key={branch} value={branch}>
                              {branch}
                              {branch === overviewQuery.data?.defaultBranch
                                ? " (default)"
                                : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    </CardContent>
                  </Card>

                  <Card className="border-border/50 bg-card/50">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <FolderTree className="h-4 w-4" />
                        Codebase structure
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Input
                        value={pathFilter}
                        onChange={event => setPathFilter(event.target.value)}
                        placeholder="Filter files and folders"
                      />
                      <div className="max-h-72 overflow-y-auto rounded-md border border-border/50">
                        {visibleEntries.map((entry: TreeEntry) => (
                          <button
                            key={`${entry.type}-${entry.path}`}
                            type="button"
                            onClick={() =>
                              entry.type === "file" &&
                              setSelectedPath(entry.path)
                            }
                            className={`flex w-full items-center gap-2 border-b border-border/30 px-3 py-2 text-left text-xs last:border-0 ${entry.type === "file" ? "hover:bg-muted/50" : "cursor-default text-muted-foreground"}`}
                          >
                            {entry.type === "file" ? (
                              <FileCode2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                            )}
                            <span className="min-w-0 flex-1 truncate font-mono">
                              {entry.path}
                            </span>
                            {entry.size !== null && (
                              <span className="text-muted-foreground">
                                {fileSize(entry.size)}
                              </span>
                            )}
                          </button>
                        ))}
                        {treeQuery.isLoading && (
                          <p className="p-5 text-center text-sm text-muted-foreground">
                            Reading repository structure…
                          </p>
                        )}
                        {treeQuery.isError && (
                          <p
                            role="alert"
                            className="p-5 text-center text-sm text-destructive"
                          >
                            Could not load structure: {treeQuery.error.message}
                          </p>
                        )}
                        {!treeQuery.isLoading &&
                          visibleEntries.length === 0 && (
                            <p className="p-5 text-center text-sm text-muted-foreground">
                              No matching files.
                            </p>
                          )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-border/50 bg-card/50">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <FileSearch className="h-4 w-4" />
                        Find code
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex gap-2">
                        <Input
                          value={searchInput}
                          onChange={event => setSearchInput(event.target.value)}
                          onKeyDown={event => {
                            if (event.key === "Enter") runSearch();
                          }}
                          placeholder="Search a component, route, API, or text"
                        />
                        <Button variant="outline" onClick={runSearch}>
                          <Search className="mr-2 h-4 w-4" />
                          Search
                        </Button>
                      </div>
                      {submittedSearch && (
                        <div className="max-h-48 overflow-y-auto rounded-md border border-border/50">
                          {codeSearchQuery.data?.results.map(result => (
                            <button
                              key={result.sha}
                              type="button"
                              onClick={() => setSelectedPath(result.path)}
                              className="block w-full border-b border-border/30 px-3 py-2 text-left font-mono text-xs hover:bg-muted/50 last:border-0"
                            >
                              {result.path}
                            </button>
                          ))}
                          {codeSearchQuery.isFetching && (
                            <p className="p-4 text-sm text-muted-foreground">
                              Searching code…
                            </p>
                          )}
                          {codeSearchQuery.isError && (
                            <p
                              role="alert"
                              className="p-4 text-sm text-destructive"
                            >
                              Search failed: {codeSearchQuery.error.message}
                            </p>
                          )}
                          {codeSearchQuery.data?.results.length === 0 && (
                            <p className="p-4 text-sm text-muted-foreground">
                              No matching code paths.
                            </p>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-border/50 bg-card/50">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <FileCode2 className="h-4 w-4" />
                        {selectedPath || "File reader"}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {!selectedPath && (
                        <p className="text-sm text-muted-foreground">
                          Choose a file from the structure or search results to
                          read it.
                        </p>
                      )}
                      {selectedPath && fileQuery.isLoading && (
                        <p className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Reading {selectedPath}…
                        </p>
                      )}
                      {selectedPath && fileQuery.isError && (
                        <p role="alert" className="text-sm text-destructive">
                          Could not read this file: {fileQuery.error.message}
                        </p>
                      )}
                      {fileQuery.data && (
                        <pre className="max-h-[560px] overflow-auto rounded-md border border-border/50 bg-muted/30 p-4 text-xs leading-relaxed">
                          <code>{fileQuery.data.content}</code>
                        </pre>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-amber-500/20 bg-amber-500/[0.035]">
                    <CardContent className="flex gap-3 p-5">
                      <GitPullRequest className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                      <div>
                        <p className="font-medium">
                          Next GitHub step: reviewed pull requests
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          When this read-only layer is proven, Toríu will
                          propose a change first. Only after your approval will
                          she create a dedicated branch and open a pull request.
                          She will never merge it.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
