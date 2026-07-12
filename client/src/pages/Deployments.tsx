/**
 * Q Workspace - Deployments Page
 * Multi-platform deployment (Vercel, Netlify, Railway, Cloudflare) with history
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Rocket, Globe, CheckCircle2, Clock, AlertCircle, Download, Loader2,
  FolderOpen, ExternalLink, Cloud, Zap, XCircle, History,
} from "lucide-react";
import { TopNav } from "@/components/TopNav";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { DeployModal } from "@/components/DeployModal";

export default function Deployments() {
  const { data: projects, isLoading } = trpc.projects.list.useQuery();
  const { data: deployStatus } = trpc.deploy.status.useQuery();
  const { data: deployHistory } = trpc.deploy.history.useQuery({});
  const [deployModalProject, setDeployModalProject] = useState<{ id: number; name: string } | null>(null);

  const downloadZip = trpc.projects.downloadZip.useMutation({
    onSuccess: (result) => {
      toast.success("ZIP ready: " + result.fileCount + " files");
      window.open(result.url, "_blank");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to generate ZIP");
    },
  });

  const deployableProjects = projects?.filter(p =>
    p.status === "completed" || p.current_phase > 1
  ) || [];

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "completed":
        return { label: "Completed", color: "#10B981", icon: CheckCircle2 };
      case "active":
        return { label: "In Progress", color: "#6366F1", icon: Clock };
      case "paused":
        return { label: "Paused", color: "#F59E0B", icon: AlertCircle };
      default:
        return { label: status, color: "#8A8A9A", icon: Clock };
    }
  };

  const getDeployStatusBadge = (status: string) => {
    switch (status) {
      case "live":
        return { label: "Live", color: "text-emerald-400", bg: "bg-emerald-500/10", icon: Globe };
      case "building":
        return { label: "Building", color: "text-blue-400", bg: "bg-blue-500/10", icon: Loader2 };
      case "deploying":
        return { label: "Deploying", color: "text-purple-400", bg: "bg-purple-500/10", icon: Rocket };
      case "failed":
        return { label: "Failed", color: "text-red-400", bg: "bg-red-500/10", icon: XCircle };
      default:
        return { label: status, color: "text-white/40", bg: "bg-white/5", icon: Clock };
    }
  };

  const getPlatformLabel = (platform: string) => {
    switch (platform) {
      case "vercel": return "Vercel";
      case "netlify": return "Netlify";
      case "railway": return "Railway";
      case "cloudflare": return "Cloudflare";
      default: return platform;
    }
  };

  // Count connected platforms
  const connectedCount = deployStatus?.platforms?.filter(p => p.connected).length || 0;

  return (
    <div className="h-screen flex flex-col surface-base">
      <TopNav />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="font-display text-xl text-foreground tracking-tight flex items-center gap-2">
                <Rocket size={18} className="text-primary/70" />
                Deployments
              </h1>
              <p className="text-[11px] text-muted-foreground/50 mt-1">
                One-click deploy to Vercel, Netlify, Railway, or Cloudflare
              </p>
            </div>
            <div className="flex items-center gap-2">
              {deployStatus && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg surface-elevated border border-border">
                  <Zap size={12} className={connectedCount > 0 ? "text-emerald-400" : "text-muted-foreground/40"} />
                  <span className="text-[10px] text-muted-foreground">
                    {connectedCount} platform{connectedCount !== 1 ? "s" : ""} connected
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Projects Section */}
          <div className="mb-10">
            <h2 className="text-xs font-medium text-white/50 uppercase tracking-wider mb-3">Projects</h2>
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="animate-spin text-primary" size={24} />
              </div>
            ) : deployableProjects.length > 0 ? (
              <div className="space-y-3">
                {deployableProjects.map((project, index) => {
                  const statusConfig = getStatusConfig(project.status);
                  const StatusIcon = statusConfig.icon;
                  const metadata = project.metadata as any;
                  const deployUrl = metadata?.deployUrl;

                  return (
                    <motion.div
                      key={project.id}
                      className="rounded-xl surface-elevated border border-border overflow-hidden"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <div className="flex items-center gap-4 p-4">
                        <StatusIcon size={18} style={{ color: statusConfig.color }} />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-[13px] font-medium text-foreground">{project.name}</h3>
                            <span className="text-[9px] font-mono text-muted-foreground/30 surface-overlay px-1.5 py-0.5 rounded border border-border">
                              {project.project_type}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-[10px] font-medium" style={{ color: statusConfig.color }}>
                              {statusConfig.label}
                            </span>
                            <span className="text-[10px] text-muted-foreground/25">|</span>
                            <span className="text-[10px] text-muted-foreground/40 flex items-center gap-1">
                              <Clock size={9} />
                              Phase {project.current_phase}/{project.total_phases}
                            </span>
                            <span className="text-[10px] text-muted-foreground/25">|</span>
                            <span className="text-[10px] text-muted-foreground/40">
                              {new Date(project.updated_at).toLocaleDateString()}
                            </span>
                          </div>
                          {deployUrl && (
                            <a
                              href={deployUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 mt-1.5 text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors"
                            >
                              <Globe size={9} />
                              {deployUrl}
                              <ExternalLink size={8} />
                            </a>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Deploy button — opens multi-platform modal */}
                          <motion.button
                            onClick={() => setDeployModalProject({ id: project.id, name: project.name })}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 hover:bg-purple-500/20 transition-colors"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.97 }}
                          >
                            <Rocket size={12} />
                            <span className="text-[10px] font-medium">Deploy</span>
                          </motion.button>

                          {/* Download ZIP button */}
                          <motion.button
                            onClick={() => downloadZip.mutate({ projectId: project.id })}
                            disabled={downloadZip.isPending}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.97 }}
                          >
                            {downloadZip.isPending ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Download size={12} />
                            )}
                            <span className="text-[10px] font-medium">ZIP</span>
                          </motion.button>
                        </div>
                      </div>

                      {project.status === "active" && project.current_phase < project.total_phases && (
                        <div className="h-0.5 bg-border">
                          <motion.div
                            className="h-full bg-primary/60 rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: ((project.current_phase / project.total_phases) * 100) + "%" }}
                            transition={{ duration: 0.5 }}
                          />
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-16">
                <FolderOpen size={32} className="mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground/60">No deployable projects yet</p>
                <p className="text-xs text-muted-foreground/40 mt-1">
                  Build a project from the chat to see it here
                </p>
              </div>
            )}
          </div>

          {/* Deployment History Section */}
          <div>
            <h2 className="text-xs font-medium text-white/50 uppercase tracking-wider mb-3 flex items-center gap-2">
              <History size={12} />
              Deployment History
            </h2>
            {deployHistory && deployHistory.length > 0 ? (
              <div className="space-y-2">
                {deployHistory.map((dep: any, index: number) => {
                  const badge = getDeployStatusBadge(dep.status);
                  const BadgeIcon = badge.icon;

                  return (
                    <motion.div
                      key={dep.id}
                      className="flex items-center gap-3 p-3 rounded-lg surface-elevated border border-border"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                    >
                      <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md ${badge.bg}`}>
                        <BadgeIcon size={10} className={`${badge.color} ${dep.status === "building" ? "animate-spin" : ""}`} />
                        <span className={`text-[9px] font-medium ${badge.color}`}>{badge.label}</span>
                      </div>

                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-white/70 font-medium">{dep.projectName || "Unnamed"}</span>
                          <span className="text-[9px] text-white/20">→</span>
                          <span className="text-[9px] text-white/40 font-mono">{getPlatformLabel(dep.platform)}</span>
                        </div>
                        {dep.commitMessage && (
                          <p className="text-[10px] text-white/30 truncate max-w-xs mt-0.5">{dep.commitMessage}</p>
                        )}
                      </div>

                      {dep.url && dep.status === "live" && (
                        <a
                          href={dep.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/5 text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors"
                        >
                          <ExternalLink size={9} />
                          Visit
                        </a>
                      )}

                      <span className="text-[9px] text-white/20 font-mono">
                        {new Date(dep.created_at).toLocaleDateString()}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-10 rounded-xl border border-border/50 surface-elevated">
                <Rocket size={20} className="mx-auto text-muted-foreground/20 mb-2" />
                <p className="text-[11px] text-muted-foreground/40">No deployments yet</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Deploy Modal */}
      <AnimatePresence>
        {deployModalProject && (
          <DeployModal
            projectId={deployModalProject.id}
            projectName={deployModalProject.name}
            onClose={() => setDeployModalProject(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
