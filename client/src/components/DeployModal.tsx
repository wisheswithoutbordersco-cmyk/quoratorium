/**
 * Deploy Modal — deploys saved project files and follows the persisted provider status.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Rocket,
  AlertCircle,
  ExternalLink,
  Loader2,
  Settings,
  Zap,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";

type Platform = "vercel" | "netlify" | "railway";
type DeployStage = "select" | "tracking" | "error";

interface DeployModalProps {
  projectId: number | string;
  projectName: string;
  onClose: () => void;
}

const PLATFORMS: {
  id: Platform;
  name: string;
  description: string;
  color: string;
}[] = [
  {
    id: "vercel",
    name: "Vercel",
    description: "Optimized for frontend frameworks",
    color: "#fff",
  },
  {
    id: "netlify",
    name: "Netlify",
    description: "JAMstack & static sites",
    color: "#00C7B7",
  },
  {
    id: "railway",
    name: "Railway",
    description: "Source deployments are not supported yet",
    color: "#9B59B6",
  },
];

export function DeployModal({
  projectId,
  projectName,
  onClose,
}: DeployModalProps) {
  const [, navigate] = useLocation();
  const [stage, setStage] = useState<DeployStage>("select");
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(
    null
  );
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [deploymentDbId, setDeploymentDbId] = useState<number | null>(null);
  const [submittedDeployment, setSubmittedDeployment] = useState<{
    status:
      | "queued"
      | "building"
      | "deploying"
      | "live"
      | "failed"
      | "cancelled";
    providerDeploymentId?: string;
    url?: string;
    error?: string | null;
  } | null>(null);

  const { data: deployStatus } = trpc.deploy.status.useQuery();
  const { data: persistedDeployment } = trpc.deploy.getStatus.useQuery(
    { deploymentId: deploymentDbId ?? 0 },
    { enabled: deploymentDbId !== null, refetchInterval: 3000 }
  );
  const deployMutation = trpc.deploy.deployToPlatform.useMutation();
  const deployment = persistedDeployment || submittedDeployment;

  const handleDeploy = async (platform: Platform) => {
    const platformStatus = deployStatus?.platforms?.find(
      p => p.platform === platform
    );
    if (!platformStatus?.deploymentSupported) {
      toast.error(
        platformStatus?.unsupportedReason ||
          `${platform} deployments are not supported yet.`
      );
      return;
    }
    if (!platformStatus?.connected) {
      toast.error(`${platform} is not connected`, {
        description: "Add your token in Settings → Platforms",
      });
      return;
    }

    setSelectedPlatform(platform);
    setDeploymentDbId(null);
    setSubmittedDeployment(null);
    setStage("tracking");

    try {
      const numericProjectId =
        typeof projectId === "number" ? projectId : Number(projectId);
      if (!Number.isSafeInteger(numericProjectId) || numericProjectId <= 0) {
        throw new Error("A saved project is required before deployment.");
      }
      const result = await deployMutation.mutateAsync({
        projectId: numericProjectId,
        platform,
        commitMessage: `Deploy ${projectName} from Quoratorium`,
      });

      if (!result.deploymentDbId) {
        throw new Error(
          "Deployment was accepted without a persisted deployment record."
        );
      }
      setSubmittedDeployment({
        status: result.status,
        providerDeploymentId: result.providerDeploymentId,
        url: result.url,
      });
      setDeploymentDbId(result.deploymentDbId);
    } catch (error: any) {
      setErrorMessage(error.message || "Deployment failed");
      setStage("error");
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Backdrop */}
        <motion.div
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        />

        {/* Modal */}
        <motion.div
          className="relative w-full max-w-lg mx-4 rounded-2xl border border-white/10 bg-[#0a0a0a] shadow-2xl overflow-hidden"
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500/20 to-blue-500/20 border border-orange-500/20 flex items-center justify-center">
                <Rocket className="w-4 h-4 text-purple-400" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Deploy Project
                </h2>
                <p className="text-[11px] text-white/40">{projectName}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/5 text-white/40 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            <AnimatePresence mode="wait">
              {stage === "select" && (
                <motion.div
                  key="select"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-3"
                >
                  <p className="text-xs text-white/50 mb-4">
                    Choose a platform to deploy your project:
                  </p>
                  {PLATFORMS.map(platform => {
                    const status = deployStatus?.platforms?.find(
                      p => p.platform === platform.id
                    );
                    const connected = status?.connected;
                    const supported = status?.deploymentSupported !== false;
                    const disabled = !supported || !connected;

                    return (
                      <button
                        key={platform.id}
                        onClick={() => void handleDeploy(platform.id)}
                        disabled={disabled}
                        className="w-full group flex items-center gap-4 p-4 rounded-xl border border-white/5 enabled:hover:border-orange-500/20 bg-white/[0.02] enabled:hover:bg-orange-500/5 transition-all text-left disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <PlatformLogo platform={platform.id} />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-white/80 group-hover:text-white">
                              {platform.name}
                            </span>
                            {!supported ? (
                              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-500/10 text-[9px] text-red-300">
                                Unsupported
                              </span>
                            ) : connected ? (
                              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-[9px] text-emerald-400">
                                <div className="w-1 h-1 rounded-full bg-emerald-400" />
                                Connected
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/5 text-[9px] text-white/30">
                                Not connected
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-white/40 mt-0.5">
                            {status?.unsupportedReason || platform.description}
                          </p>
                        </div>
                        <Zap className="w-4 h-4 text-white/10 group-hover:text-purple-400 transition-colors" />
                      </button>
                    );
                  })}

                  {/* Settings link */}
                  <button
                    onClick={() => navigate("/settings")}
                    className="w-full flex items-center justify-center gap-2 mt-3 py-2 text-[11px] text-white/30 hover:text-white/60 transition-colors"
                  >
                    <Settings className="w-3 h-3" />
                    Manage platform connections in Settings
                  </button>
                </motion.div>
              )}

              {stage === "tracking" && (
                <motion.div
                  key="tracking"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="flex flex-col items-center py-8"
                >
                  <motion.div
                    className="relative mb-6"
                    animate={{ y: [0, -8, 0] }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  >
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-500/20 to-blue-500/20 border border-orange-500/20 flex items-center justify-center">
                      <Rocket className="w-7 h-7 text-purple-400" />
                    </div>
                  </motion.div>

                  <h3 className="text-sm font-medium text-white/80 mb-1">
                    {deployment
                      ? `Deployment ${deployment.status}`
                      : `Submitting to ${selectedPlatform}`}
                  </h3>
                  <p className="text-[11px] text-white/40 mb-4 text-center max-w-xs">
                    {deployment
                      ? deployment.status === "live"
                        ? "The provider reports this deployment is live."
                        : deployment.status === "failed"
                          ? deployment.error ||
                            "The provider reported a deployment failure."
                          : "Waiting for the provider’s next status update."
                      : "Creating a persisted deployment record…"}
                  </p>

                  {deployment?.providerDeploymentId && (
                    <p className="text-[10px] text-white/30 font-mono mb-3">
                      Provider ID: {deployment.providerDeploymentId}
                    </p>
                  )}

                  {deployment?.url && deployment.status === "live" && (
                    <a
                      href={deployment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:border-emerald-500/20 hover:bg-emerald-500/5 transition-all group"
                    >
                      <span className="text-xs text-white/70 group-hover:text-emerald-300 font-mono truncate max-w-[280px]">
                        {deployment.url}
                      </span>
                      <ExternalLink className="w-3.5 h-3.5 text-white/30 group-hover:text-emerald-400 flex-shrink-0" />
                    </a>
                  )}

                  <button
                    onClick={() => {
                      setStage("select");
                      setDeploymentDbId(null);
                      setSubmittedDeployment(null);
                    }}
                    className="mt-6 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white/60 hover:text-white transition-all"
                  >
                    Deploy another project copy
                  </button>
                </motion.div>
              )}

              {stage === "error" && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="flex flex-col items-center py-8"
                >
                  <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
                    <AlertCircle className="w-7 h-7 text-red-400" />
                  </div>

                  <h3 className="text-sm font-medium text-red-300 mb-1">
                    Deployment Failed
                  </h3>
                  <p className="text-[11px] text-white/40 text-center max-w-xs mb-4">
                    {errorMessage}
                  </p>

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setStage("select");
                        setDeploymentDbId(null);
                        setSubmittedDeployment(null);
                      }}
                      className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white/60 hover:text-white transition-all"
                    >
                      Try Again
                    </button>
                    <button
                      onClick={onClose}
                      className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white/40 hover:text-white/60 transition-all"
                    >
                      Close
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Platform Logos ──────────────────────────────────────────────────────────

function PlatformLogo({ platform }: { platform: Platform }) {
  const baseClass =
    "w-10 h-10 rounded-xl flex items-center justify-center border";

  switch (platform) {
    case "vercel":
      return (
        <div className={`${baseClass} bg-white/5 border-white/10`}>
          <svg viewBox="0 0 76 65" className="w-5 h-5" fill="white">
            <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
          </svg>
        </div>
      );
    case "netlify":
      return (
        <div className={`${baseClass} bg-[#00C7B7]/5 border-[#00C7B7]/20`}>
          <svg viewBox="0 0 256 256" className="w-5 h-5" fill="#00C7B7">
            <path d="M153.094 84.842l-27.266 27.266-27.266-27.266 27.266-27.266 27.266 27.266zm-27.266 40.899l-27.266-27.266L71.296 125.741l27.266 27.266 27.266-27.266zm0 27.266l27.266-27.266 27.266 27.266-27.266 27.266-27.266-27.266zm54.532-27.266l-27.266-27.266 27.266-27.266 27.266 27.266-27.266 27.266z" />
          </svg>
        </div>
      );
    case "railway":
      return (
        <div className={`${baseClass} bg-orange-500/5 border-orange-500/20`}>
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#9B59B6">
            <path d="M.113 14.669a.757.757 0 0 0 .76.756h8.502a.757.757 0 0 0 .756-.756V5.913a.757.757 0 0 0-.756-.756H.873a.757.757 0 0 0-.76.756v8.756zm13.869 0a.757.757 0 0 0 .756.756h8.502a.757.757 0 0 0 .76-.756V5.913a.757.757 0 0 0-.76-.756h-8.502a.757.757 0 0 0-.756.756v8.756z" />
          </svg>
        </div>
      );
  }
}
