import { Github, LockKeyhole } from "lucide-react";

interface PushToGitHubProps {
  files: { path: string; content: string }[];
  contextSummary: string;
  onClose: () => void;
}

/**
 * Kept as a compatibility component for older conversation records. Phase 1
 * never exposes a mutation from this surface.
 */
export function PushToGitHub({ files, onClose }: PushToGitHubProps) {
  return (
    <div className="mt-3 rounded-xl border border-emerald-500/20 bg-[#050505] p-4">
      <div className="mb-3 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10">
          <LockKeyhole className="h-4 w-4 text-emerald-300" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <Github className="h-4 w-4 text-white/60" />
            <h4 className="text-sm font-medium text-white/85">
              GitHub is read-only
            </h4>
          </div>
          <p className="mt-1 text-xs leading-5 text-white/45">
            {files.length} generated file{files.length === 1 ? " is" : "s are"}{" "}
            available in this conversation, but Toríu cannot push code during
            phase one.
          </p>
        </div>
      </div>
      <p className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-[11px] leading-5 text-white/50">
        The next write phase will use proposal → isolated branch → pull request
        for your review. Toríu will never merge the pull request.
      </p>
      <button
        type="button"
        onClick={onClose}
        className="mt-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/65 transition-colors hover:bg-white/10 hover:text-white"
      >
        Close
      </button>
    </div>
  );
}
