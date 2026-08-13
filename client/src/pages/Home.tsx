/**
 * Q Workspace — Home (Command Workspace)
 * 
 * Split-pane layout:
 * - Left Sidebar: Project/conversation history (hidden on mobile, accessible via drawer)
 * - Center Panel (Cognitive Zone): Synthesis conversation
 * - Right Panel: Live Preview (when code is generated)
 * - Top Navigation (Command Center): Global navigation + preview toggle
 * 
 * Mobile back button: Drawer states push history entries so back button closes them
 * instead of exiting the app.
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Eye, EyeOff } from "lucide-react";
import { TopNav } from "@/components/TopNav";
import { ConversationPanel } from "@/components/panels/ConversationPanel";
import { WorkspacePreviewPanel, MobilePreviewOverlay } from "@/components/panels/WorkspacePreviewPanel";
import { ProjectSidebar } from "@/components/ProjectSidebar";
import { BootScreen } from "@/components/BootScreen";
import { useUIStore } from "@/stores";
import { useSettingsStore } from "@/stores/settingsStore";
import { duration, ease } from "@/lib/motion";
import { useAuth } from "@/_core/hooks/useAuth";

export default function Home() {
  const { user, loading } = useAuth();
  const { previewPanelOpen, previewCode, togglePreviewPanel } = useUIStore();
  const animationIntensity = useSettingsStore((s) => s.settings["appearance.animationIntensity"] || "full");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [booted, setBooted] = useState(() => {
    if (sessionStorage.getItem("q-booted")) return true;
    return false;
  });

  // Track viewport size for responsive behavior
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // ─── Mobile back button: push a history entry when drawer opens ───────────
  const drawerHistoryPushed = useRef(false);

  const openMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(true);
    if (!drawerHistoryPushed.current) {
      window.history.pushState({ drawerOpen: true }, "", window.location.href);
      drawerHistoryPushed.current = true;
    }
  }, []);

  const closeMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(false);
    drawerHistoryPushed.current = false;
  }, []);

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (mobileSidebarOpen) {
        e.preventDefault();
        closeMobileSidebar();
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [mobileSidebarOpen, closeMobileSidebar]);

  useEffect(() => {
    if (!isMobile) {
      closeMobileSidebar();
    }
  }, [isMobile]);

  const handleBootComplete = useCallback(() => {
    setBooted(true);
    sessionStorage.setItem("q-booted", "1");
  }, []);

  const showPreviewPanel = previewPanelOpen && previewCode;

  return (
    <div className="h-screen flex flex-col overflow-hidden surface-base">
      {/* Cinematic Boot Screen */}
      {!booted && <BootScreen onComplete={handleBootComplete} />}

      {/* Top Navigation */}
      <TopNav
        onMobileSidebarOpen={isMobile ? openMobileSidebar : undefined}
      />

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar — Project History (hidden on mobile, shown in drawer) */}
        <div className="hidden md:flex">
          <ProjectSidebar
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          />
        </div>

        {/* Mobile Sidebar Drawer */}
        <AnimatePresence>
          {isMobile && mobileSidebarOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={closeMobileSidebar}
              />
              {/* Drawer */}
              <motion.div
                className="fixed inset-y-0 left-0 z-50 w-[85vw] max-w-[320px] flex flex-col surface-base border-r border-border shadow-2xl"
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
              >
                {/* Drawer header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <span className="text-[11px] font-medium tracking-[0.15em] uppercase text-muted-foreground">
                    Conversations
                  </span>
                  <button
                    onClick={closeMobileSidebar}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
                {/* Sidebar content */}
                <div className="flex-1 overflow-hidden">
                  <ProjectSidebar
                    collapsed={false}
                    onToggle={() => {}}
                    onConversationSelect={closeMobileSidebar}
                  />
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Center Panel — Cognitive Zone (chat with Captain Q) */}
        <motion.div
          className="flex flex-col relative surface-base flex-1 lg:border-r lg:border-border"
          layout
          animate={{
            flex: isMobile
              ? "1 1 100%"
              : showPreviewPanel
                ? "0 0 50%"
                : "1 1 100%",
          }}
          style={{ minWidth: 0 }}
          transition={{ duration: duration.normal, ease: ease.out }}
        >
          <ConversationPanel onMobileSidebarOpen={isMobile ? openMobileSidebar : undefined} />
        </motion.div>

        {/* Right Panel — Live Preview (takes priority when code is available) */}
        <AnimatePresence mode="wait">
          {showPreviewPanel && !isMobile && (
            <motion.div
              className="flex-col hidden md:flex flex-1 relative border-l border-white/5"
              style={{ backgroundColor: "#000000" }}
              initial={{ opacity: 0, x: 20, width: 0 }}
              animate={{ opacity: 1, x: 0, width: "auto" }}
              exit={{ opacity: 0, x: 20, width: 0 }}
              transition={{ duration: animationIntensity === "off" ? 0 : duration.normal, ease: ease.out }}
            >
              <WorkspacePreviewPanel />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Preview toggle button (desktop only) */}
        <div className="absolute top-3 right-3 z-20 hidden lg:flex items-center gap-1">
          {/* Preview toggle — only visible when there's code to preview */}
          {previewCode && (
            <motion.button
              onClick={togglePreviewPanel}
              className={`p-2 rounded-sm border transition-colors ${
                previewPanelOpen
                  ? "surface-elevated border-white/10 text-white/60 hover:text-white"
                  : "surface-elevated border-border text-muted-foreground hover:text-primary hover:border-primary/30"
              }`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title={previewPanelOpen ? "Hide preview" : "Show preview"}
            >
              {previewPanelOpen ? <EyeOff size={14} /> : <Eye size={14} />}
            </motion.button>
          )}
        </div>
      </div>

      {/* Mobile: Preview overlay (full-screen) */}
      <AnimatePresence>
        {isMobile && previewPanelOpen && previewCode && (
          <MobilePreviewOverlay />
        )}
      </AnimatePresence>

      {/* Mobile: Preview toggle button (floating, bottom-right) */}
      {isMobile && previewCode && !previewPanelOpen && (
        <motion.button
          onClick={togglePreviewPanel}
          className="fixed bottom-20 right-4 z-30 p-3 rounded-full bg-white/5 border border-white/10 text-white/50 hover:text-white/80 hover:bg-white/10 shadow-lg backdrop-blur-sm transition-all"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          whileTap={{ scale: 0.9 }}
          title="Show preview"
        >
          <Eye size={18} />
        </motion.button>
      )}

      {/* System heartbeat bar (hidden when animations off) */}
      {animationIntensity !== "off" && <HeartbeatBar />}
    </div>
  );
}

function HeartbeatBar() {
  return (
    <div className="h-[3px] w-full relative overflow-hidden surface-base">
      <motion.div
        className="absolute inset-y-0 w-24"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(124,58,237,0.4), transparent)",
        }}
        animate={{ x: ["-100px", "calc(100vw + 100px)"] }}
        transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent" />
    </div>
  );
}
