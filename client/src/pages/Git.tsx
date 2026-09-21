import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  CheckCircle2,
  FileCode2,
  FolderTree,
  Github,
  History,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

export default function Git() {
  const { user } = useAuth();
  const [tokenInput, setTokenInput] = useState("");
  const [repositoryInput, setRepositoryInput] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [showConnectForm, setShowConnectForm] = useState(false);

  const statusQuery = trpc.git.status.useQuery(undefined, { enabled: !!user });
  const reposQuery = trpc.git.listRepos.useQuery(undefined, {
    enabled: !!user && !!statusQuery.data?.connected,
  });
  const catalogQuery = trpc.git.catalog.useQuery(undefined, {
    enabled: !!user,
  });
  const auditQuery = trpc.git.auditLog.useQuery(
    { limit: 20 },
    {
      enabled: !!user && !!statusQuery.data?.connected,
    }
  );
  const repositoryQuery = trpc.git.repository.useQuery(
    { repo: selectedRepo || "" },
    { enabled: !!selectedRepo }
  );
  const commitsQuery = trpc.git.commits.useQuery(
    { repo: selectedRepo || "" },
    { enabled: !!selectedRepo }
  );
  const branchesQuery = trpc.git.branches.useQuery(
    { repo: selectedRepo || "" },
    { enabled: !!selectedRepo }
  );
  const treeQuery = trpc.git.tree.useQuery(
    { repo: selectedRepo || "", limit: 120 },
    { enabled: !!selectedRepo }
  );

  const connectMutation = trpc.git.connect.useMutation({
    onSuccess: data => {
      toast.success(`Connected as ${data.username} in read-only mode`);
      setTokenInput("");
      setRepositoryInput("");
      setShowConnectForm(false);
      void statusQuery.refetch();
      void reposQuery.refetch();
    },
    onError: err => toast.error(err.message),
  });

  const disconnectMutation = trpc.git.disconnect.useMutation({
    onSuccess: () => {
      toast.success("GitHub disconnected");
      setSelectedRepo(null);
      void statusQuery.refetch();
    },
    onError: err => toast.error(err.message),
  });

  const isConnected = statusQuery.data?.connected;
  const repository = repositoryQuery.data as any;

  return (
    <div className="min-h-screen bg-background p-4 text-foreground md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center gap-2">
          <Link href="/workspace">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Workspace
            </Button>
          </Link>
        </div>

        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-3">
              <Github className="h-7 w-7" />
              <h1 className="text-2xl font-bold">GitHub</h1>
              <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-300">
                Read only
              </span>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Toríu can map repositories, find code, read files, and explain how
              the system works. GitHub writes are locked during this phase.
            </p>
          </div>
          {isConnected && statusQuery.data?.connectionType === "personal" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
              className="border-red-400/30 text-red-400 hover:bg-red-400/10"
            >
              Disconnect
            </Button>
          )}
        </div>

        <Card className="border-emerald-400/20 bg-emerald-400/[0.04]">
          <CardContent className="grid gap-4 p-5 md:grid-cols-[auto_1fr]">
            <ShieldCheck className="h-7 w-7 text-emerald-300" />
            <div>
              <h2 className="font-semibold text-emerald-200">
                Policy enforced in the server, not just the screen
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Repository creation, branch creation, commits, direct pushes,
                pull requests, and merges are disabled. The next GitHub phase
                will permit only proposal → isolated branch → pull request.
                Toríu will never receive merge capability.
              </p>
            </div>
          </CardContent>
        </Card>

        {!isConnected && (
          <Card className="border-border/50 bg-card/50">
            <CardHeader>
              <CardTitle className="text-lg">
                Connect selected repositories
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!showConnectForm ? (
                <div className="py-8 text-center">
                  <LockKeyhole className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                  <p className="mb-4 text-sm text-muted-foreground">
                    Use a fine-grained GitHub token limited to the repositories
                    Toríu should inspect.
                  </p>
                  <Button onClick={() => setShowConnectForm(true)}>
                    Connect read-only token
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg border border-border/50 bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
                    Create a{" "}
                    <a
                      href="https://github.com/settings/personal-access-tokens/new"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 underline"
                    >
                      fine-grained personal access token
                    </a>
                    , select only the repositories Toríu may see, and grant{" "}
                    <strong className="text-foreground">
                      Contents: Read-only
                    </strong>{" "}
                    plus{" "}
                    <strong className="text-foreground">
                      Metadata: Read-only
                    </strong>
                    . Tokens exposing classic write scopes are rejected.
                  </div>
                  <Input
                    type="password"
                    placeholder="github_pat_…"
                    value={tokenInput}
                    onChange={event => setTokenInput(event.target.value)}
                    className="font-mono"
                    autoComplete="off"
                  />
                  <div className="space-y-2">
                    <label
                      className="text-sm font-medium"
                      htmlFor="github-repositories"
                    >
                      Authorized repositories
                    </label>
                    <Textarea
                      id="github-repositories"
                      placeholder={
                        "wisheswithoutbordersco-cmyk/quoratorium\nwisheswithoutbordersco-cmyk/oracle-ai"
                      }
                      value={repositoryInput}
                      onChange={event => setRepositoryInput(event.target.value)}
                      className="min-h-28 font-mono text-sm"
                    />
                    <p className="text-xs leading-5 text-muted-foreground">
                      Enter one owner/repository per line. Toríu rejects every
                      repository not listed here, even if the token can see it.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        const repositories = repositoryInput
                          .split(/[\n,]+/)
                          .map(repository => repository.trim())
                          .filter(Boolean);
                        connectMutation.mutate({
                          token: tokenInput,
                          repositories,
                        });
                      }}
                      disabled={
                        !tokenInput.trim() ||
                        !repositoryInput.trim() ||
                        connectMutation.isPending
                      }
                    >
                      {connectMutation.isPending
                        ? "Verifying…"
                        : "Verify and connect"}
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

        {isConnected && (
          <>
            <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
              <Card className="border-border/50 bg-card/50">
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <div>
                    <CardTitle className="text-base">Repositories</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Connected as {statusQuery.data?.username}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void reposQuery.refetch()}
                  >
                    Refresh
                  </Button>
                </CardHeader>
                <CardContent className="max-h-[680px] space-y-2 overflow-y-auto">
                  {reposQuery.data?.map(repo => (
                    <button
                      key={repo.id}
                      onClick={() => setSelectedRepo(repo.fullName)}
                      className={`w-full rounded-lg border p-3 text-left transition-colors ${
                        selectedRepo === repo.fullName
                          ? "border-emerald-400/40 bg-emerald-400/10"
                          : "border-border/30 hover:border-border/70 hover:bg-accent/30"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {repo.name}
                        </span>
                        {repo.private && (
                          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">
                            Private
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span>{repo.language || "Mixed"}</span>
                        <span>Policy: read only</span>
                      </div>
                    </button>
                  ))}
                  {reposQuery.isLoading && (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      Loading repositories…
                    </p>
                  )}
                  {reposQuery.data?.length === 0 && (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      No repositories are available to this credential.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/50 bg-card/50">
                <CardContent className="p-6">
                  {!selectedRepo ? (
                    <div className="py-20 text-center text-muted-foreground">
                      <FolderTree className="mx-auto mb-3 h-10 w-10 opacity-60" />
                      <p className="text-lg">Select a repository</p>
                      <p className="mt-1 text-sm">
                        Toríu can inspect these same repositories from chat.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-7">
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                        <div>
                          <h2 className="text-lg font-semibold">
                            {selectedRepo}
                          </h2>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {repository?.description ||
                              "No repository description"}
                          </p>
                        </div>
                        <a
                          href={`https://github.com/${selectedRepo}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-400 hover:underline"
                        >
                          Open on GitHub →
                        </a>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <Metric
                          label="Default branch"
                          value={repository?.defaultBranch || "…"}
                        />
                        <Metric
                          label="Primary language"
                          value={repository?.language || "Mixed"}
                        />
                        <Metric
                          label="Files mapped"
                          value={String(treeQuery.data?.entries.length ?? "…")}
                        />
                      </div>

                      <section>
                        <div className="mb-3 flex items-center gap-2">
                          <FolderTree className="h-4 w-4 text-emerald-300" />
                          <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                            Repository map
                          </h3>
                        </div>
                        <div className="max-h-72 overflow-y-auto rounded-lg border border-border/30 bg-black/10 p-3 font-mono text-xs">
                          {treeQuery.data?.entries.map(entry => (
                            <div
                              key={`${entry.type}:${entry.path}`}
                              className="flex items-center gap-2 py-1 text-muted-foreground"
                            >
                              <span
                                className={
                                  entry.type === "tree"
                                    ? "text-amber-300"
                                    : "text-blue-300"
                                }
                              >
                                {entry.type === "tree" ? "dir" : "file"}
                              </span>
                              <span className="truncate">{entry.path}</span>
                            </div>
                          ))}
                          {treeQuery.isLoading && (
                            <p className="py-5 text-center">
                              Mapping repository…
                            </p>
                          )}
                        </div>
                      </section>

                      <section>
                        <div className="mb-3 flex items-center gap-2">
                          <FileCode2 className="h-4 w-4 text-emerald-300" />
                          <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                            Branches
                          </h3>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {branchesQuery.data?.map(branch => (
                            <span
                              key={branch.name}
                              className="rounded-full border border-border/40 bg-muted/30 px-3 py-1 text-xs"
                            >
                              {branch.name}
                              {branch.protected ? " · protected" : ""}
                            </span>
                          ))}
                        </div>
                      </section>

                      <section>
                        <div className="mb-3 flex items-center gap-2">
                          <History className="h-4 w-4 text-emerald-300" />
                          <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                            Recent commits
                          </h3>
                        </div>
                        <div className="space-y-2">
                          {commitsQuery.data?.slice(0, 10).map(commit => (
                            <div
                              key={commit.fullSha}
                              className="flex items-start gap-3 rounded-lg border border-border/20 p-3"
                            >
                              <code className="mt-0.5 shrink-0 text-xs text-blue-400">
                                {commit.sha}
                              </code>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm">
                                  {commit.message}
                                </p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {commit.author} ·{" "}
                                  {new Date(commit.date).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="border-border/50 bg-card/50">
                <CardHeader>
                  <CardTitle className="text-base">Action Catalog</CardTitle>
                </CardHeader>
                <CardContent className="max-h-[520px] space-y-2 overflow-y-auto">
                  {catalogQuery.data?.map(action => (
                    <div
                      key={action.id}
                      className="rounded-lg border border-border/25 p-3 text-sm"
                    >
                      <div className="flex items-start gap-2">
                        {action.enabled ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                        ) : (
                          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-medium">{action.label}</p>
                            <span
                              className={
                                action.enabled
                                  ? "text-xs text-emerald-300"
                                  : "text-xs text-red-300"
                              }
                            >
                              {action.enabled
                                ? "Enabled"
                                : action.mode === "prohibited"
                                  ? "Prohibited"
                                  : "Locked"}
                            </span>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {action.capability}
                          </p>
                          <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground/80">
                            Permission: {action.permissions.join(", ")} · Mode:{" "}
                            {action.mode} · Risk: {action.riskLevel} ·
                            Confirmation: {action.confirmationRule} · Audit:{" "}
                            {action.audit ? "required" : "off"}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-border/50 bg-card/50">
                <CardHeader>
                  <CardTitle className="text-base">Audit trail</CardTitle>
                </CardHeader>
                <CardContent className="max-h-80 space-y-2 overflow-y-auto">
                  {auditQuery.data?.slice(0, 12).map(record => (
                    <div
                      key={
                        record.id || `${record.actionId}-${record.createdAt}`
                      }
                      className="rounded-lg border border-border/20 p-3 text-xs"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">{record.actionId}</span>
                        <span
                          className={
                            record.outcome === "blocked" ||
                            record.outcome === "failed"
                              ? "text-red-300"
                              : "text-emerald-300"
                          }
                        >
                          {record.outcome}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-muted-foreground">
                        {record.target || "GitHub account"}
                      </p>
                      <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                        Risk: {record.riskLevel} · Confirmation:{" "}
                        {record.confirmationRule}
                      </p>
                    </div>
                  ))}
                  {auditQuery.data?.length === 0 && (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      Read actions will appear here after Toríu uses GitHub.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-medium">{value}</p>
    </div>
  );
}
