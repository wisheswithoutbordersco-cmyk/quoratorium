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
  FolderKanban,
  Lock,
  Settings,
  Menu,
  X,
  PanelLeft,
} from "lucide-react";
import { useState, useRef } from "react";
import { QIdentity } from "./QIdentity";
import { useProjectStore, useOrchestrationStore } from "@/stores";
import { useAuth } from "@/_core/hooks/useAuth";
import { duration, ease } from "@/lib/motion";
import { SessionHealthIndicator } from "./SessionHealthIndicator";

const navItems = [
  { path: "/workspace/projects", label: "Projects", icon: FolderKanban },
  { path: "/workspace/launchpad", label: "Launchpad", icon: Rocket },
  { path: "/workspace/vault", label: "Vault", icon: Lock },
  { path: "/workspace/settings", label: "Settings", icon: Settings },
];

interface TopNavProps {
  /** Called when the mobile sidebar button is pressed (only passed on mobile) */
  onMobileSidebarOpen?: () => void;
}

export function TopNav({ onMobileSidebarOpen }: TopNavProps) {
  const [location, setLocation] = useLocation();
  const { activeProject } = useProjectStore();
  const { agents } = useOrchestrationStore();
  const { user, isAuthenticated } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuHistoryPushed = useRef(false);
  const activeAgents = agents.filter((a) => a.status === "active").length;

  const openMobileMenu = () => {
    setMobileMenuOpen(true);
    if (!menuHistoryPushed.current) {
      window.history.pushState({ mobileMenuOpen: true }, "", window.location.href);
      menuHistoryPushed.current = true;
    }
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
    menuHistoryPushed.current = false;
  };

  // Close mobile menu on popstate (back button)
  // Note: Home.tsx handles the sidebar drawer popstate; this handles the nav menu
  useState(() => {
    const handler = (e: PopStateEvent) => {
      if (mobileMenuOpen) {
        setMobileMenuOpen(false);
        menuHistoryPushed.current = false;
      }
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  });

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
      <Link href="/workspace" className="flex items-center gap-2.5 mr-6 group">
        <QIdentity size={22} state="idle" />
        <span className="font-display text-[11px] tracking-[0.2em] text-foreground/80 group-hover:text-foreground transition-colors hidden sm:inline uppercase">
          Workspace
        </span>
      </Link>

      {/* Active Project Indicator */}
      {activeProject && location === "/" && (
        <motion.div
          className="hidden md:flex items-center gap-2 mr-4 px-3 py-1.5 rounded-md surface-elevated border border-border"
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: duration.normal, ease: ease.out }}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_6px_rgba(124,58,237,0.5)]" />
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
        {navItems.map((item) => {
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

        {/* System status */}
        <div className="hidden sm:flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[#10B981] shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
          <span className="text-[9px] text-muted-foreground/50 tracking-[0.1em] font-medium uppercase">Online</span>
        </div>

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
              {navItems.map((item) => {
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
