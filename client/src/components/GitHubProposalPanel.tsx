import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileCode2,
  GitBranch,
  GitPullRequest,
  KeyRound,
  Loader2,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface ProposalFile {
  path: string;
  content: string;
}

interface Proposal {
  id: string;
  repository: string;
  base_branch: string;
  branch_name: string;
  title: string;
  body: string;
  commit_message: string;
  files: ProposalFile[];
  status:
    | "proposed"
    | "executing"
    | "pull_request_opened"
    | "cancelled"
    | "failed";
  risk_level: "high";
  confirmation_rule: "always_confirm";
  pull_request_number: number | null;
  pull_request_url: string | null;
  error: string | null;
  created_at: string;
}

const statusText: Record<Proposal["status"], string> = {
  proposed: "Waiting for your review",
  executing: "Creating branch and draft pull request",
  pull_request_opened: "Draft pull request opened",
  cancelled: "Cancelled",
  failed: "Needs attention",
};

export function GitHubProposalPanel({
  githubConnected = true,
}: {
  githubConnected?: boolean;
}) {
  const utils = trpc.useUtils();
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [actionCode, setActionCode] = useState("");
  const [confirming, setConfirming] = useState<Proposal | null>(null);
  const [confirmationText, setConfirmationText] = useState("");

  const sessionQuery = trpc.businessActions.sessionStatus.useQuery(undefined, {
    retry: false,
    refetchInterval: 60_000,
  });
  const proposalsQuery = trpc.git.proposals.useQuery(
    { limit: 30 },
    { retry: false, refetchInterval: 15_000 }
  );
  const proposals = useMemo(
    () => (proposalsQuery.data || []) as Proposal[],
    [proposalsQuery.data]
  );

  const refresh = async () => {
    await Promise.all([
      utils.git.proposals.invalidate(),
      utils.businessActions.sessionStatus.invalidate(),
    ]);
  };

  const unlockMutation = trpc.businessActions.unlock.useMutation({
    onSuccess: async result => {
      setActionCode("");
      setUnlockOpen(false);
      await refresh();
      toast.success(
        `GitHub actions unlocked until ${new Date(result.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. Review the proposal, then approve it.`
      );
    },
    onError: error => toast.error(error.message),
  });
  const cancelMutation = trpc.git.cancelProposal.useMutation({
    onSuccess: async () => {
      await refresh();
      toast.success("Proposal cancelled. Nothing was sent to GitHub.");
    },
    onError: error => toast.error(error.message),
  });
  const openPullRequestMutation = trpc.git.openPullRequest.useMutation({
    onSuccess: async proposal => {
      setConfirming(null);
      setConfirmationText("");
      await refresh();
      toast.success(
        `Draft pull request #${proposal.pull_request_number} opened. Toríu cannot merge it.`
      );
    },
    onError: async error => {
      await refresh();
      toast.error(error.message);
    },
  });

  if (proposalsQuery.isLoading) {
    return (
      <Card className="border-border/50 bg-card/50">
        <CardContent className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading GitHub proposals…
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-amber-500/20 bg-amber-500/[0.035]">
        <CardHeader className="pb-3">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <GitPullRequest className="h-4 w-4 text-amber-300" />
                Reviewed change proposals
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Toríu can prepare these records, but only you can approve the
                external GitHub action.
              </p>
            </div>
            <div className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200">
              High risk · always confirm
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!githubConnected && proposals.some(p => p.status === "proposed") && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
              A proposal is waiting, but GitHub must be reconnected before it
              can create a branch or draft pull request. Reconnect it in{" "}
              <a
                href="/workspace/settings"
                className="font-semibold underline underline-offset-2"
              >
                Workspace Settings
              </a>
              , then return here to approve.
            </div>
          )}
          {proposals.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
              No proposals yet. Ask Toríu to inspect a repository and propose a
              specific code change. She will save the complete payload here
              without changing GitHub.
            </div>
          ) : (
            proposals.map(proposal => {
              const pending = proposal.status === "proposed";
              return (
                <section
                  key={proposal.id}
                  className="rounded-xl border border-border/60 bg-background/55 p-4"
                >
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-300/80">
                        {proposal.repository}
                      </p>
                      <h3 className="mt-1 text-sm font-semibold">
                        {proposal.title}
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {statusText[proposal.status]}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-border bg-background px-2 py-1 text-[9px] font-semibold text-muted-foreground">
                      {proposal.status.replaceAll("_", " ").toUpperCase()}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-2 rounded-lg border border-border/50 bg-muted/20 p-3 text-xs sm:grid-cols-2">
                    <div>
                      <p className="text-muted-foreground">Branch</p>
                      <p className="mt-1 break-all font-mono">
                        {proposal.base_branch} → {proposal.branch_name}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Commit message</p>
                      <p className="mt-1">{proposal.commit_message}</p>
                    </div>
                  </div>

                  {proposal.body && (
                    <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                      {proposal.body}
                    </p>
                  )}

                  <div className="mt-3 space-y-2">
                    {proposal.files.map(file => (
                      <details
                        key={file.path}
                        className="rounded-lg border border-border/50"
                      >
                        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs hover:bg-muted/40">
                          <FileCode2 className="h-3.5 w-3.5 text-primary" />
                          <span className="min-w-0 flex-1 truncate font-mono">
                            {file.path}
                          </span>
                          <span className="text-muted-foreground">
                            Review file
                          </span>
                        </summary>
                        <pre className="max-h-72 overflow-auto border-t border-border/40 bg-muted/30 p-3 text-xs leading-relaxed">
                          <code>{file.content}</code>
                        </pre>
                      </details>
                    ))}
                  </div>

                  {proposal.error && (
                    <p
                      role="alert"
                      className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
                    >
                      {proposal.error}
                    </p>
                  )}

                  {proposal.pull_request_url ? (
                    <a
                      href={proposal.pull_request_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/15"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Open draft pull
                      request #{proposal.pull_request_number}
                    </a>
                  ) : pending ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          cancelMutation.mutate({ id: proposal.id })
                        }
                        disabled={cancelMutation.isPending}
                      >
                        <X className="mr-1.5 h-3.5 w-3.5" /> Cancel proposal
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          if (!sessionQuery.data?.unlocked) {
                            setUnlockOpen(true);
                            return;
                          }
                          setConfirmationText("");
                          setConfirming(proposal);
                        }}
                      >
                        disabled={!githubConnected}
                        <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                        {githubConnected
                          ? "Review and approve"
                          : "Reconnect GitHub to approve"}
                      </Button>
                    </div>
                  ) : null}
                </section>
              );
            })
          )}
        </CardContent>
      </Card>

      {unlockOpen && (
        <div
          className="fixed inset-0 z-[100] grid place-items-end bg-black/75 p-3 sm:place-items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Unlock GitHub actions"
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-background p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold">Unlock GitHub actions</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Enter your owner action code. Unlocking does not contact
                  GitHub. The exact proposal still requires a separate
                  confirmation.
                </p>
              </div>
            </div>
            <label className="mt-4 block text-xs text-muted-foreground">
              Owner action code
              <Input
                className="mt-1.5"
                type="password"
                autoComplete="off"
                value={actionCode}
                onChange={event => setActionCode(event.target.value)}
              />
            </label>
            {!sessionQuery.data?.configured && (
              <p className="mt-3 text-xs text-destructive">
                The owner action code is not configured in Railway.
              </p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setUnlockOpen(false);
                  setActionCode("");
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() =>
                  unlockMutation.mutate({ code: actionCode.trim() })
                }
                disabled={
                  !sessionQuery.data?.configured ||
                  actionCode.trim().length < 8 ||
                  unlockMutation.isPending
                }
              >
                {unlockMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="mr-2 h-4 w-4" />
                )}
                Unlock
              </Button>
            </div>
          </div>
        </div>
      )}

      {confirming && (
        <div
          className="fixed inset-0 z-[100] grid place-items-end overflow-y-auto bg-black/80 p-3 sm:place-items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm GitHub pull request"
        >
          <div className="my-4 w-full max-w-3xl rounded-2xl border border-amber-500/30 bg-background p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-amber-500/10 p-2 text-amber-300">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold">Final GitHub confirmation</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  This will create one <span className="font-mono">toriu/</span>{" "}
                  branch, one commit containing the files below, and one draft
                  pull request. It will not merge anything.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 rounded-xl border border-border p-4 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">Repository</p>
                <p className="mt-1 font-mono">{confirming.repository}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Base → branch</p>
                <p className="mt-1 break-all font-mono">
                  {confirming.base_branch} → {confirming.branch_name}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  Pull-request title
                </p>
                <p className="mt-1">{confirming.title}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Commit message</p>
                <p className="mt-1">{confirming.commit_message}</p>
              </div>
            </div>

            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
              {confirming.files.map(file => (
                <details
                  key={file.path}
                  className="rounded-lg border border-border/50"
                  open={confirming.files.length === 1}
                >
                  <summary className="cursor-pointer px-3 py-2 font-mono text-xs">
                    {file.path}
                  </summary>
                  <pre className="max-h-52 overflow-auto border-t border-border/40 bg-muted/30 p-3 text-xs">
                    <code>{file.content}</code>
                  </pre>
                </details>
              ))}
            </div>

            <label className="mt-4 block text-xs text-muted-foreground">
              Type{" "}
              <span className="font-mono text-foreground">
                OPEN PULL REQUEST
              </span>{" "}
              to confirm this exact payload.
              <Input
                className="mt-1.5"
                value={confirmationText}
                onChange={event => setConfirmationText(event.target.value)}
                autoComplete="off"
              />
            </label>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setConfirming(null);
                  setConfirmationText("");
                }}
              >
                Go back
              </Button>
              <Button
                onClick={() =>
                  openPullRequestMutation.mutate({
                    id: confirming.id,
                    confirmation: "OPEN_PULL_REQUEST",
                  })
                }
                disabled={
                  confirmationText !== "OPEN PULL REQUEST" ||
                  openPullRequestMutation.isPending
                }
                className="bg-amber-500 text-black hover:bg-amber-400"
              >
                {openPullRequestMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <GitBranch className="mr-2 h-4 w-4" />
                )}
                Create branch and draft PR
              </Button>
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-[10px] text-emerald-300/80">
              <CheckCircle2 className="h-3.5 w-3.5" /> Merge remains unavailable
              to Toríu.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
