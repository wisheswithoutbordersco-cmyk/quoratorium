/**
 * Q Workspace — 404 Page
 */
import { motion } from "framer-motion";
import { TopNav } from "@/components/TopNav";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="h-screen flex flex-col surface-base">
      <TopNav />
      <div className="flex-1 flex items-center justify-center">
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <p className="font-display text-6xl text-foreground/10 mb-4">404</p>
          <p className="text-[13px] text-muted-foreground/50 mb-6">This sector does not exist.</p>
          <button
            onClick={() => setLocation("/workspace")}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary/90 transition-colors"
          >
            Return to Command
          </button>
        </motion.div>
      </div>
    </div>
  );
}
