/**
 * Heartbeat Dot — Tiny pulsing indicator near Captain Q's avatar during generation
 * Part of Patent 3: Anti-Loop Heartbeat Interrupt
 */
import { useUIStore } from "@/stores";

export function HeartbeatDot() {
  const { heartbeatActive } = useUIStore();

  if (!heartbeatActive) return null;

  return (
    <span className="relative inline-flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full rounded-full bg-white/40 animate-ping" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-white/60" />
    </span>
  );
}

/**
 * MemorySavedToast — Brief auto-dismissing toast when memory is saved
 */
export function MemorySavedToast() {
  const { lastMemorySaved, showMemorySavedToast } = useUIStore();

  if (!lastMemorySaved) return null;

  // Auto-dismiss after 2 seconds
  setTimeout(() => showMemorySavedToast(""), 2000);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80" />
        <span className="text-[11px] text-white/60">
          Memory saved to {lastMemorySaved.replace(/_/g, " ")}
        </span>
      </div>
    </div>
  );
}
