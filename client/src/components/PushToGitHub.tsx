/**
 * Push to GitHub Dialog
 * Shows after code generation in chat. Allows one-click push to connected GitHub repo.
 */
import { useState, useEffect, useMemo } from "react";
import { GitBranch, Github, Loader2, Check, AlertCircle, Settings } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";

interface PushToGitHubProps {
  files: { path: string; content: string }[];
  contextSummary: string; // Used to auto-generate commit message
  onClose: () => void;
}

export function PushToGitHub({ files, contextSummary, onClose }: PushToGitHubProps) {
  const [, navigate] = useLocation();
  const [selectedRepo, setSelectedRepo] = useState("");
  const [branch, setBranch] = useState("main");
  const [commitMessage, setCommitMessage] = useState("");
  const [isPushing, setIsPushing] = useState(false);
  const [pushSuccess, setPushSuccess] = useState(false);

  const { data: gitStatus, isLoading: statusLoading } = trpc.git.status.useQuery();
  const { data: repos } = trpc.git.listRepos.useQuery(undefined, {
    enabled: !!gitStatus?.connected,
  });
  const { data: branches } = trpc.git.branches.useQuery(
    { repo: selectedRepo },
    { enabled: !!selectedRepo }
  );
  const pushMutation = trpc.git.push.useMutation();

  // Auto-generate commit message from context
  useEffect(() => {
    const autoMessage = generateCommitMessage(contextSummary, files);
    setCommitMessage(autoMessage);
  }, [contextSummary, files]);

  // Set default repo from connection defaults
  useEffect(() => {
    if (gitStatus?.defaultRepo) {
      setSelectedRepo(gitStatus.defaultRepo);
    }
    if (gitStatus?.defaultBranch) {
      setBranch(gitStatus.defaultBranch);
    }
  }, [gitStatus]);

  const handlePush = async () => {
    if (!selectedRepo || !commitMessage.trim()) {
      toast.error("Please select a repo and enter a commit message");
      return;
    }

    setIsPushing(true);
    try {
      const result = await pushMutation.mutateAsync({
        repo: selectedRepo,
        files,
        commitMessage: commitMessage.trim(),
        branch: branch || undefined,
      });

      setPushSuccess(true);
      toast.success(`Pushed to github.com/${selectedRepo} on branch ${branch}`, {
        description: `Commit: ${(result as any).commitSha?.slice(0, 7) || "success"}`,
      });

      setTimeout(() => onClose(), 2000);
    } catch (error: any) {
      const message = error?.message || "Push failed";
      if (message.includes("401") || message.includes("auth") || message.includes("token")) {
        toast.error("GitHub authentication expired", {
          description: "Please reconnect your GitHub account in Settings → Git",
        });
      } else if (message.includes("conflict") || message.includes("409")) {
        toast.error("Push conflict detected", {
          description: "Try pulling the latest changes first or push to a new branch",
        });
      } else {
        toast.error("Push failed", { description: message });
      }
    } finally {
      setIsPushing(false);
    }
  };

  // Not connected state
  if (!statusLoading && !gitStatus?.connected) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#050505] p-4 mt-3">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
            <Github className="w-4 h-4 text-white/40" />
          </div>
          <div>
            <h4 className="text-sm font-medium text-white/80">GitHub Not Connected</h4>
            <p className="text-[11px] text-white/40">Connect your GitHub account to push code</p>
          </div>
        </div>
        <button
          onClick={() => navigate("/workspace/settings")}
          className="w-full px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white/70 hover:text-white transition-all flex items-center justify-center gap-2"
        >
          <Settings className="w-3.5 h-3.5" />
          Go to GitHub Settings
        </button>
      </div>
    );
  }

  // Success state
  if (pushSuccess) {
    return (
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 mt-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <Check className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h4 className="text-sm font-medium text-emerald-300">Pushed Successfully</h4>
            <p className="text-[11px] text-white/40">
              {files.length} file{files.length !== 1 ? "s" : ""} pushed to {selectedRepo} ({branch})
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#050505] p-4 mt-3">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
          <Github className="w-4 h-4 text-purple-400" />
        </div>
        <div>
          <h4 className="text-sm font-medium text-white/80">Push to GitHub</h4>
          <p className="text-[11px] text-white/40">
            {files.length} file{files.length !== 1 ? "s" : ""} ready to push
          </p>
        </div>
      </div>

      {/* Repo Selector */}
      <div className="space-y-3">
        <div>
          <label className="text-[11px] text-white/40 font-medium mb-1 block">Repository</label>
          <select
            value={selectedRepo}
            onChange={(e) => setSelectedRepo(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/80 outline-none focus:border-purple-500/30 transition-colors"
          >
            <option value="" className="bg-[#050505]">Select a repository...</option>
            {repos?.map((repo: any) => (
              <option key={repo.full_name} value={repo.full_name} className="bg-[#050505]">
                {repo.full_name}
              </option>
            ))}
          </select>
        </div>

        {/* Branch */}
        <div>
          <label className="text-[11px] text-white/40 font-medium mb-1 block">Branch</label>
          <div className="flex items-center gap-2">
            <GitBranch className="w-3.5 h-3.5 text-white/30" />
            <select
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/80 outline-none focus:border-purple-500/30 transition-colors"
            >
              {branches?.map((b: any) => (
                <option key={b.name} value={b.name} className="bg-[#050505]">
                  {b.name}
                </option>
              )) || <option value={branch} className="bg-[#050505]">{branch}</option>}
            </select>
          </div>
        </div>

        {/* Commit Message */}
        <div>
          <label className="text-[11px] text-white/40 font-medium mb-1 block">Commit Message</label>
          <textarea
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/80 outline-none focus:border-purple-500/30 resize-none transition-colors"
            placeholder="Describe your changes..."
          />
        </div>

        {/* File List Preview */}
        <div className="border border-white/5 rounded-lg p-2 max-h-24 overflow-y-auto">
          {files.slice(0, 8).map((file, i) => (
            <div key={i} className="flex items-center gap-2 py-0.5 text-[11px] text-white/50">
              <span className="text-emerald-400">+</span>
              <span className="truncate">{file.path}</span>
            </div>
          ))}
          {files.length > 8 && (
            <p className="text-[10px] text-white/30 mt-1">...and {files.length - 8} more files</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white/60 hover:text-white transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handlePush}
            disabled={isPushing || !selectedRepo || !commitMessage.trim()}
            className="flex-1 px-3 py-2 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 text-xs text-purple-300 hover:text-purple-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isPushing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Pushing...
              </>
            ) : (
              <>
                <Github className="w-3.5 h-3.5" />
                Push to GitHub
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Generate a commit message from the conversation context
function generateCommitMessage(context: string, files: { path: string; content: string }[]): string {
  const fileTypes = Array.from(new Set(files.map(f => {
    const ext = f.path.split(".").pop()?.toLowerCase() || "file";
    return ext;
  })));

  // Infer action from context
  const contextLower = context.toLowerCase();
  let prefix = "feat";
  if (contextLower.includes("fix") || contextLower.includes("bug")) prefix = "fix";
  else if (contextLower.includes("refactor")) prefix = "refactor";
  else if (contextLower.includes("style") || contextLower.includes("css")) prefix = "style";
  else if (contextLower.includes("test")) prefix = "test";
  else if (contextLower.includes("doc")) prefix = "docs";

  // Build message
  const summary = context.slice(0, 60).replace(/\n/g, " ").trim();
  const fileInfo = files.length === 1
    ? files[0].path
    : `${files.length} files (${fileTypes.join(", ")})`;

  return `${prefix}: ${summary}\n\nGenerated by Captain Q\nFiles: ${fileInfo}`;
}
