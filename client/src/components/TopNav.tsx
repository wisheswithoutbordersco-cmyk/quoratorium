/**
 * Q Workspace — Top Navigation (The Command Center)
 * Source: MBS Section 3.2
 *
 * Global navigation: Projects, Vault, Settings
 * Features: Active project indicator, system status, responsive mobile menu, user avatar
 * Mobile: sidebar button opens the conversation drawer (back button closes it)
 */
import { useLocation, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3,
  Bot,
  Brain,
  CreditCard,
  DollarSign,
  FileStack,
  FolderKanban,
  GitBranch,
  HardDrive,
  HeartPulse,
  KeyRound,
  ListTodo,
  LogOut,
  Package,
  PanelLeft,
  Rocket,
  ShieldCheck,
  Share2,
  UserRound,
  Settings,
  Menu,
  X,
} from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { QIdentity } from "./QIdentity";
import { useProjectStore, useOrchestrationStore } from "@/stores";
import { useAuth } from "@/_core/hooks/useAuth";
import { duration, ease } from "@/lib/motion";
import { SessionHealthIndicator } from "./SessionHealthIndicator";
import { trpc } from "@/lib/trpc";

const navItems = [
  { path: "/workspace/projects", label: "Projects", icon: FolderKanban },
  { path: "/workspace/templates", label: "Templates", icon: FileStack },
  { path: "/workspace/knowledge", label: "Knowledge", icon: Brain },
  { path: "/workspace/memory", label: "Memory", icon: HardDrive },
  { path: "/workspace/vault", label: "Vault", icon: KeyRound },
  { path: "/workspace/git", label: "Git", icon: GitBranch },
  { path: "/workspace/sharing", label: "Sharing", icon: Share2 },
  { path: "/workspace/billing", label: "Billing", icon: CreditCard },
  { path: "/workspace/settings", label: "Settings", icon: Settings },
  { path: "/workspace/profile", label: "Profile", icon: UserRound },
  { path: "/workspace/launchpad", label: "Launchpad", icon: Rocket },
];

const operationalNavItems = [
  { path: "/workspace/analytics", label: "Analytics", icon: BarChart3 },
  { path: "/workspace/builders", label: "Builders", icon: Bot },
  { path: "/workspace/costs", label: "Costs", icon: DollarSign },
  { path: "/workspace/deployments", label: "Deployments", icon: Rocket },
  { path: "/workspace/jobs", label: "Jobs", icon: ListTodo },
  {
    path: "/workspace/observability",
    label: "Observability",
    icon: HeartPulse,
  },
  { path: "/workspace/security", label: "Security", icon: ShieldCheck },
  { path: "/workspace/recyclatorium", label: "Recyclatorium", icon: Package },
];

interface TopNavProps {
  /** Called when the mobile sidebar button is pressed (only passed on mobile) */
  onMobileSidebarOpen?: () => void;
}

export function TopNav({ onMobileSidebarOpen }: TopNavProps) {
  const [location] = useLocation();
  const { activeProject } = useProjectStore();
  const { agents } = useOrchestrationStore();
  const { user, isAuthenticated, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuHistoryPushed = useRef(false);
  const activeAgents = agents.filter(a => a.status === "active").length;
  const availableNavItems =
    user?.role === "admin" ? [...navItems, ...operationalNavItems] : navItems;

  const openMobileMenu = () => {
    setMobileMenuOpen(true);
    if (!menuHistoryPushed.current) {
      window.history.pushState(
        { mobileMenuOpen: true },
        "",
        window.location.href
      );
      menuHistoryPushed.current = true;
    }
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
    menuHistoryPushed.current = false;
  };

  // Close mobile menu on popstate (back button)
  // Note: Home.tsx handles the sidebar drawer popstate; this handles the nav menu
  useEffect(() => {
    const handler = (e: PopStateEvent) => {
      if (mobileMenuOpen) {
        setMobileMenuOpen(false);
        menuHistoryPushed.current = false;
      }
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [mobileMenuOpen]);

  return (
    <nav className="h-12 border-b border-border flex items-center px-4 lg:px-5 relative z-50 surface-base">
      {/* Mobile: Sidebar drawer button (shows conversation list) */}
      {onMobileSidebarOpen && (
        <button
          className="lg:hidden mr-2 p-2 rounded-md text-muted-foreground hover:text-foreground transition-colors"
          onClick={onMobileSidebarOpen}
          aria-label="Open conversations"
        >
          <PanelLeft size={16} />
        </button>
      )}

      {/* Logo / Home */}
      <Link
        href="/workspace"
        className="flex items-center gap-2.5 mr-6 group"
        aria-label="Quoratorium workspace home"
      >
        <QIdentity size={22} state="idle" />
        <span className="font-display text-[11px] tracking-[0.2em] text-foreground/80 group-hover:text-foreground transition-colors hidden sm:inline uppercase">
          Quoratorium
        </span>
      </Link>

      {/* Active Project Indicator */}
      {activeProject && location === "/workspace" && (
        <motion.div
          className="hidden md:flex items-center gap-2 mr-4 px-3 py-1.5 rounded-md surface-elevated border border-border"
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: duration.normal, ease: ease.out }}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_6px_rgba(216, 102, 24,0.5)]" />
          <span className="text-[10px] font-medium text-muted-foreground tracking-wide">
            {activeProject.name}
          </span>
          <span className="text-[9px] text-muted-foreground/40 font-mono">
            P{activeProject.currentPhase}/16
          </span>
        </motion.div>
      )}

      {/* Desktop Navigation */}
      <div className="hidden lg:flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto">
        {availableNavItems.map(item => {
          const isActive = location === item.path;
          const Icon = item.icon;
          return (
            <Link key={item.path} href={item.path}>
              <motion.div
                className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-medium tracking-[0.08em] uppercase transition-colors ${
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                whileHover={{ backgroundColor: "rgba(255, 255, 255, 0.04)" }}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.12 }}
              >
                <Icon size={13} strokeWidth={isActive ? 2 : 1.5} />
                <span>{item.label}</span>
                {isActive && (
                  <motion.div
                    className="absolute -bottom-[7px] left-3 right-3 h-[2px] bg-primary rounded-full"
                    layoutId="nav-indicator"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
              </motion.div>
            </Link>
          );
        })}
      </div>

      {/* Right side — Status + User Avatar */}
      <div className="ml-auto flex items-center gap-3">
        {/* Active agents count */}
        {activeAgents > 0 && (
          <div className="hidden sm:flex items-center gap-1.5">
            <motion.div
              className="w-1.5 h-1.5 rounded-full bg-[#10B981]"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
            <span className="text-[9px] font-mono text-muted-foreground/60">
              {activeAgents} active
            </span>
          </div>
        )}

        {/* Session Health Indicator */}
        <SessionHealthIndicator />

        <SystemHealthStatus />

        {isAuthenticated && (
          <>
            <Link
              href="/workspace/profile"
              className="hidden md:flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
              aria-label="Open profile"
              title={user?.name || "Profile"}
            >
              <UserRound size={13} />
            </Link>
            <button
              onClick={() => void logout()}
              className="hidden md:flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={13} />
            </button>
          </>
        )}

        {/* Mobile menu toggle (hamburger for nav items) */}
        <button
          className="lg:hidden p-2 rounded-md text-muted-foreground hover:text-foreground transition-colors"
          onClick={mobileMenuOpen ? closeMobileMenu : openMobileMenu}
        >
          {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {/* Mobile Navigation Dropdown */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            className="absolute top-12 left-0 right-0 border-b border-border p-4 lg:hidden z-50 surface-base"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: duration.fast, ease: ease.out }}
          >
            <div className="grid grid-cols-2 gap-1.5">
              {availableNavItems.map(item => {
                const isActive = location === item.path;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    onClick={closeMobileMenu}
                  >
                    <div
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-md text-[10px] font-medium tracking-[0.08em] uppercase transition-colors ${
                        isActive
                          ? "text-primary bg-primary/5 border border-primary/20"
                          : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                      }`}
                    >
                      <Icon size={13} />
                      <span>{item.label}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}

export function SystemHealthStatus({ compact = false }: { compact?: boolean }) {
  const [healthCheckStartedAt] = useState(() => Date.now());
  const healthQuery = trpc.system.health.useQuery(
    { timestamp: healthCheckStartedAt },
    {
      refetchInterval: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    }
  );

  const status = healthQuery.isLoading
    ? {
        label: "Checking",
        color: "bg-zinc-400",
        glow: "",
      }
    : healthQuery.data?.status === "healthy"
      ? {
          label: "Connected",
          color: "bg-emerald-400",
          glow: "shadow-[0_0_6px_rgba(16,185,129,0.5)]",
        }
      : healthQuery.data?.status === "degraded"
        ? {
            label: "Degraded",
            color: "bg-amber-400",
            glow: "shadow-[0_0_6px_rgba(251,191,36,0.45)]",
          }
        : {
            label: navigator.onLine ? "Unavailable" : "Offline",
            color: "bg-red-400",
            glow: "shadow-[0_0_6px_rgba(248,113,113,0.45)]",
          };

  return (
    <span
      className={`flex items-center gap-2 ${compact ? "" : "hidden sm:flex"}`}
      title={`System health: ${status.label}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${status.color} ${status.glow}`}
      />
      <span className="text-[9px] text-muted-foreground/50 tracking-[0.1em] font-medium uppercase">
        {status.label}
      </span>
    </span>
  );
}
