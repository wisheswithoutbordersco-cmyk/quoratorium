import { Github, GitPullRequest, ShieldCheck, Settings } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";

interface PushToGitHubProps {
  files: { path: string; content: string }[];
  contextSummary: string;
  onClose: () => void;
}

/**
 * Generated code is intentionally preview-only. Direct repository pushes are
 * disabled while Toríu's GitHub integration is read-only. The next enabled
 * workflow will create a reviewable proposal, then an owner-approved branch
 * and pull request; Toríu never merges code.
 */
export function PushToGitHub({
  files,
  contextSummary,
  onClose,
}: PushToGitHubProps) {
  const [, navigate] = useLocation();
  const { data: gitStatus, isLoading } = trpc.git.status.useQuery();

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-[#050505] p-4">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10">
          <Github className="h-4 w-4 text-amber-300" />
        </div>
        <div>
          <h4 className="text-sm font-medium text-white/80">
            GitHub change preview
          </h4>
          <p className="text-[11px] text-white/40">
            {files.length} generated file{files.length === 1 ? "" : "s"}; no
            repository changes have been made.
          </p>
        </div>
      </div>

      {!isLoading && !gitStatus?.connected ? (
        <div className="space-y-3">
          <p className="text-xs text-white/50">
            Connect GitHub first so Toríu can inspect your codebase. GitHub
            reading is safe and does not modify repositories.
          </p>
          <button
            onClick={() => navigate("/workspace/settings")}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70 transition-all hover:bg-white/10 hover:text-white"
          >
            <Settings className="h-3.5 w-3.5" />
            Go to GitHub Settings
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-200/80">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              GitHub is connected for repository reading. Direct push, branch
              creation, pull-request opening, and merge are disabled in this
              phase.
            </span>
          </div>
          <div className="max-h-24 overflow-y-auto rounded-lg border border-white/5 p-2">
            {files.slice(0, 8).map(file => (
              <div
                key={file.path}
                className="flex items-center gap-2 py-0.5 text-[11px] text-white/50"
              >
                <span className="text-amber-300">•</span>
                <span className="truncate">{file.path}</span>
              </div>
            ))}
            {files.length > 8 && (
              <p className="mt-1 text-[10px] text-white/30">
                …and {files.length - 8} more files
              </p>
            )}
          </div>
          {contextSummary && (
            <p className="line-clamp-2 text-[11px] text-white/40">
              {contextSummary}
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60 transition-all hover:bg-white/10 hover:text-white"
            >
              Close preview
            </button>
            <button
              onClick={() => navigate("/workspace/git")}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/15 px-3 py-2 text-xs text-amber-200 transition-all hover:bg-amber-500/25"
            >
              <GitPullRequest className="h-3.5 w-3.5" />
              Open Git Explorer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
