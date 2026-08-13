/**
 * Q Workspace - Projects Page
 * Full project creation wizard with Captain planning and build pipeline
 */
import { useState } from "react";
import { DeployModal } from "@/components/DeployModal";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, FolderKanban, Clock, CheckCircle2, Loader2, FolderOpen, Play, Rocket } from "lucide-react";
import { TopNav } from "@/components/TopNav";
import { trpc } from "@/lib/trpc";
import { useProjectStore } from "@/stores";
import { useLocation } from "wouter";
import { duration, ease } from "@/lib/motion";
import { toast } from "sonner";

const PROJECT_TYPES = [
  { value: "website", label: "Website", description: "Landing pages, portfolios, marketing sites" },
  { value: "app", label: "Web App", description: "Interactive applications, dashboards" },
  { value: "api", label: "API", description: "Backend services, REST/GraphQL endpoints" },
  { value: "dashboard", label: "Dashboard", description: "Analytics, monitoring, data viz" },
  { value: "automation", label: "Automation", description: "Workflows, integrations, bots" },
  { value: "document", label: "Document", description: "Reports, specs, documentation" },
  { value: "other", label: "Other", description: "Custom project type" },
] as const;

export default function Projects() {
  const [, setLocation] = useLocation();
  const { setActiveProject } = useProjectStore();
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [newProject, setNewProject] = useState({ name: "", description: "", projectType: "website" as string });
  const [buildingProjectId, setBuildingProjectId] = useState<number | null>(null);
  const [buildProgress, setBuildProgress] = useState("");
  const [deployModalProject, setDeployModalProject] = useState<{ id: number; name: string } | null>(null);

  const { data: projects, isLoading } = trpc.projects.list.useQuery();
  const utils = trpc.useUtils();

  const createProject = trpc.projects.create.useMutation({
    onSuccess: (result) => {
      toast.success("Project created! Starting build pipeline...");
      setShowWizard(false);
      setWizardStep(1);
      utils.projects.list.invalidate();
      // Auto-trigger build if description provided
      if (newProject.description.trim()) {
        triggerBuild(result.id);
      }
      setNewProject({ name: "", description: "", projectType: "website" });
    },
    onError: (error) => {
      toast.error("Failed: " + error.message);
    },
  });

  const buildProject = trpc.ai.build.useMutation({
    onSuccess: (result) => {
      toast.success("Build complete! " + result.filesGenerated + " files generated");
      setBuildingProjectId(null);
      setBuildProgress("");
      utils.projects.list.invalidate();
    },
    onError: (error) => {
      toast.error("Build failed: " + error.message);
      setBuildingProjectId(null);
      setBuildProgress("");
    },
  });

  const triggerBuild = (projectId: number) => {
    setBuildingProjectId(projectId);
    setBuildProgress("Captain Q is analyzing your project...");
    buildProject.mutate({
      projectId,
      task: newProject.description || "Build a " + newProject.projectType + " project called " + newProject.name,
    });
  };

  const handleCreateProject = () => {
    if (!newProject.name.trim()) {
      toast.error("Project name is required");
      return;
    }
    createProject.mutate({
      name: newProject.name.trim(),
      description: newProject.description.trim() || undefined,
      projectType: newProject.projectType as any,
    });
  };

  const handleSelectProject = (project: any) => {
    setActiveProject({
      id: String(project.id),
      name: project.name,
      description: project.description || "",
      status: project.status,
      currentPhase: project.current_phase || 0,
      createdAt: new Date(project.created_at),
      updatedAt: new Date(project.updated_at),
    });
    setLocation("/workspace");
    toast('Switched to "' + project.name + '"');
  };

  return (
    <div className="h-screen flex flex-col surface-base">
      <TopNav />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="font-display text-xl text-foreground tracking-tight">Projects</h1>
              <p className="text-[11px] text-muted-foreground/50 mt-1">
                {projects?.length || 0} project{(projects?.length || 0) !== 1 ? "s" : ""}
              </p>
            </div>
            <motion.button
              onClick={() => setShowWizard(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-primary text-primary-foreground text-[11px] font-medium"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              <Plus size={13} />
              New Project
            </motion.button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="animate-spin text-primary" size={24} />
            </div>
          ) : projects && projects.length > 0 ? (
            <div className="grid gap-3">
              {projects.map((project, index) => (
                <motion.div
                  key={project.id}
                  className="group p-4 rounded-xl surface-elevated border border-border hover:border-primary/20 transition-colors cursor-pointer"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => handleSelectProject(project)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg surface-overlay">
                        <FolderKanban size={16} className="text-primary/70" />
                      </div>
                      <div>
                        <h3 className="text-[13px] font-medium text-foreground">{project.name}</h3>
                        <p className="text-[11px] text-muted-foreground/50 mt-0.5 line-clamp-1">{project.description}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <StatusBadge status={project.status} />
                          <span className="text-[9px] font-mono text-muted-foreground/30">
                            {project.project_type || "project"}
                          </span>
                          <span className="text-[9px] text-muted-foreground/30 flex items-center gap-1">
                            <Clock size={9} />
                            {formatTimeAgo(new Date(project.created_at))}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Deploy button for completed projects */}
                      {(project.status === "completed" || project.current_phase > 1) && (
                        <motion.button
                          onClick={(e) => { e.stopPropagation(); setDeployModalProject({ id: project.id, name: project.name }); }}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[10px] font-medium hover:bg-purple-500/20 transition-colors"
                          whileTap={{ scale: 0.95 }}
                        >
                          <Rocket size={10} />
                          Deploy
                        </motion.button>
                      )}
                      {/* Build button for projects that haven't been built yet */}
                      {project.status === "active" && project.current_phase <= 1 && (
                        <motion.button
                          onClick={(e) => { e.stopPropagation(); triggerBuild(project.id); }}
                          disabled={buildingProjectId === project.id}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-medium hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                          whileTap={{ scale: 0.95 }}
                        >
                          {buildingProjectId === project.id ? (
                            <Loader2 size={10} className="animate-spin" />
                          ) : (
                            <Play size={10} />
                          )}
                          Build
                        </motion.button>
                      )}
                      {/* Phase mini-bar */}
                      <div className="flex gap-[1.5px] h-3">
                        {Array.from({ length: Math.min(project.total_phases || 16, 16) }, (_, i) => (
                          <div
                            key={i}
                            className="w-[3px] rounded-full"
                            style={{
                              backgroundColor:
                                i < (project.current_phase || 0)
                                  ? project.status === "completed" ? "#10B981" : "#7C3AED"
                                  : "rgba(255,255,255,0.08)",
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Build progress indicator */}
                  {buildingProjectId === project.id && (
                    <motion.div
                      className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/10"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                    >
                      <Loader2 size={12} className="animate-spin text-primary" />
                      <span className="text-[10px] text-primary/80">{buildProgress || "Building..."}</span>
                    </motion.div>
                  )}
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-20">
              <FolderOpen size={32} className="mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground/60">No projects yet</p>
              <p className="text-xs text-muted-foreground/40 mt-1">Create your first project to get started</p>
            </div>
          )}
        </div>
      </div>

      {/* Project Creation Wizard */}
      <AnimatePresence>
        {showWizard && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowWizard(false)}
          >
            <motion.div
              className="surface-elevated border border-border rounded-2xl p-6 w-full max-w-lg mx-4 shadow-2xl"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: duration.normal, ease: ease.out }}
              onClick={(e) => e.stopPropagation()}
            >
              {wizardStep === 1 && (
                <>
                  <h2 className="text-base font-display text-foreground mb-1">What are you building?</h2>
                  <p className="text-xs text-muted-foreground mb-4">Captain Q will analyze your project and create a build plan</p>
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {PROJECT_TYPES.map((type) => (
                      <button
                        key={type.value}
                        onClick={() => setNewProject({ ...newProject, projectType: type.value })}
                        className={"text-left p-3 rounded-lg border transition-all " +
                          (newProject.projectType === type.value
                            ? "border-primary bg-primary/5 text-foreground"
                            : "border-border text-muted-foreground hover:border-primary/30")}
                      >
                        <span className="text-xs font-medium block">{type.label}</span>
                        <span className="text-[10px] text-muted-foreground/60">{type.description}</span>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setWizardStep(2)}
                    className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                  >
                    Continue
                  </button>
                </>
              )}

              {wizardStep === 2 && (
                <>
                  <h2 className="text-base font-display text-foreground mb-1">Project Details</h2>
                  <p className="text-xs text-muted-foreground mb-4">Describe what you want - Captain Q will break it into phases</p>
                  <div className="space-y-3 mb-4">
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">
                        Project Name
                      </label>
                      <input
                        type="text"
                        value={newProject.name}
                        onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                        placeholder="My Awesome Project"
                        className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">
                        What should Captain Q build?
                      </label>
                      <textarea
                        value={newProject.description}
                        onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                        placeholder="Describe your project in detail. E.g.: A modern portfolio website with dark theme, animated hero section, project gallery with filtering, contact form, and responsive design using React + Tailwind..."
                        className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors resize-none h-28"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setWizardStep(1)}
                      className="flex-1 py-2.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleCreateProject}
                      disabled={!newProject.name.trim() || createProject.isPending}
                      className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {createProject.isPending ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <>
                          <Rocket size={12} />
                          Create & Build
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-[9px] text-muted-foreground/40 mt-3 text-center">
                    Captain Q will route to Builder (OpenAI) for code generation and Validator (Claude) for review
                  </p>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; label: string }> = {
    active: { color: "#10B981", label: "Active" },
    paused: { color: "#F59E0B", label: "Paused" },
    completed: { color: "#7C3AED", label: "Completed" },
    archived: { color: "#8A8A9A", label: "Archived" },
  };
  const c = config[status] || { color: "#8A8A9A", label: status };

  return (
    <span className="flex items-center gap-1 text-[9px] font-medium tracking-wider uppercase" style={{ color: c.color }}>
      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.color }} />
      {c.label}
    </span>
  );
}

function formatTimeAgo(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return minutes + "m ago";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + "h ago";
  return Math.floor(hours / 24) + "d ago";
}
