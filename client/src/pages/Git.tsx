import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function Git() {
  const { user } = useAuth();

  const [tokenInput, setTokenInput] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [newRepoName, setNewRepoName] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [showConnectForm, setShowConnectForm] = useState(false);

  const statusQuery = trpc.git.status.useQuery(undefined, { enabled: !!user });
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

  const connectMutation = trpc.git.connect.useMutation({
    onSuccess: (data) => {
      toast.success(`Connected as ${data.username}`);
      setTokenInput("");
      setShowConnectForm(false);
      statusQuery.refetch();
      reposQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const disconnectMutation = trpc.git.disconnect.useMutation({
    onSuccess: () => {
      toast.success("GitHub disconnected");
      statusQuery.refetch();
    },
  });

  const createRepoMutation = trpc.git.createRepo.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.fullName} created successfully`);
      setNewRepoName("");
      reposQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const createBranchMutation = trpc.git.createBranch.useMutation({
    onSuccess: (data) => {
      toast.success(`Branch '${data.name}' created`);
      setNewBranchName("");
      branchesQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const isConnected = statusQuery.data?.connected;

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
            <h1 className="text-2xl font-bold">Git Integration</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Push and pull code directly to GitHub
            </p>
          </div>
          {isConnected && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                Connected as <span className="text-emerald-400 font-medium">{statusQuery.data?.username}</span>
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => disconnectMutation.mutate()}
                className="text-red-400 border-red-400/30 hover:bg-red-400/10"
              >
                Disconnect
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
                    <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor">
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
                    <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">
                      github.com/settings/tokens
                    </a>{" "}
                    with <code className="bg-zinc-800 px-1 rounded">repo</code> scope.
                  </p>
                  <Input
                    type="password"
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    className="font-mono"
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={() => connectMutation.mutate({ token: tokenInput })}
                      disabled={!tokenInput || connectMutation.isPending}
                    >
                      {connectMutation.isPending ? "Connecting..." : "Connect"}
                    </Button>
                    <Button variant="outline" onClick={() => setShowConnectForm(false)}>
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
                <Button size="sm" variant="outline" onClick={() => reposQuery.refetch()}>
                  Refresh
                </Button>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[500px] overflow-y-auto">
                {/* Create Repo */}
                <div className="flex gap-2 mb-3">
                  <Input
                    placeholder="New repo name"
                    value={newRepoName}
                    onChange={(e) => setNewRepoName(e.target.value)}
                    className="text-sm"
                  />
                  <Button
                    size="sm"
                    onClick={() => createRepoMutation.mutate({ name: newRepoName })}
                    disabled={!newRepoName || createRepoMutation.isPending}
                  >
                    +
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
                      <span className="text-sm font-medium truncate">{repo.name}</span>
                      {repo.private && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                          Private
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      {repo.language && (
                        <span className="text-xs text-muted-foreground">{repo.language}</span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(repo.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </button>
                ))}

                {reposQuery.isLoading && (
                  <p className="text-sm text-muted-foreground text-center py-4">Loading repos...</p>
                )}
                {reposQuery.data?.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No repositories yet</p>
                )}
              </CardContent>
            </Card>

            {/* Repo Details */}
            <Card className="border-border/50 bg-card/50 backdrop-blur lg:col-span-2">
              <CardContent className="p-6">
                {!selectedRepo ? (
                  <div className="text-center py-16 text-muted-foreground">
                    <p className="text-lg">Select a repository</p>
                    <p className="text-sm mt-1">Choose a repo from the list to view commits and branches</p>
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
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                          Branches
                        </h3>
                        <div className="flex gap-2">
                          <Input
                            placeholder="New branch"
                            value={newBranchName}
                            onChange={(e) => setNewBranchName(e.target.value)}
                            className="text-sm w-36"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => createBranchMutation.mutate({ repo: selectedRepo, branchName: newBranchName })}
                            disabled={!newBranchName || createBranchMutation.isPending}
                          >
                            Create
                          </Button>
                        </div>
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
                              <p className="text-sm truncate">{commit.message}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {commit.author} · {new Date(commit.date).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        ))}
                        {commitsQuery.isLoading && (
                          <p className="text-sm text-muted-foreground text-center py-4">Loading commits...</p>
                        )}
                        {commitsQuery.data?.length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-4">No commits yet</p>
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
