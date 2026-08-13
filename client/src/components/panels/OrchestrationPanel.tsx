/**
 * Q Workspace — Orchestration Panel (The Execution Zone)
 * Source: MBS Sections 3.2, 4.5
 * 
 * Features:
 * - Real-time orchestration event feed
 * - 16-phase progress tracker
 * - Active worker/agent cards
 * - System thought stream
 * - Dual mode: Interactive / Passive
 * - Expandable event details with reasoning chains
 * - Ambient motion layer
 */
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight,
  CheckCircle2,
  Circle,
  AlertCircle,
  Loader2,
  Cpu,
  Shield,
  Rocket,
  Crown,
  Activity,
  Eye,
  EyeOff,
  Zap,
  Clock,
  TrendingUp,
} from "lucide-react";
import { useOrchestrationStore, useProjectStore, type OrchestrationEvent, type Agent } from "@/stores";
import { useOrchestrationEngine } from "@/hooks/useOrchestrationEngine";
import { QIdentity } from "@/components/QIdentity";
import { duration, ease } from "@/lib/motion";

export function OrchestrationPanel() {
  const { mode, setMode, agents, systemLoad, uptime } = useOrchestrationStore();
  const { phases } = useProjectStore();
  const engine = useOrchestrationEngine();
  const feedRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex flex-col h-full relative z-10">
      {/* Ambient motion */}
      <AmbientLayer />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border relative z-10">
        <div className="flex items-center gap-3">
          <SystemPulse load={systemLoad} />
          <div className="h-4 w-px bg-border" />
          <div>
            <h2 className="text-[12px] font-display text-foreground tracking-tight">
              Orchestration
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-muted-foreground tracking-wider uppercase">
                {engine.activeEvents.length} active
              </span>
              <UptimeDisplay seconds={uptime} />
            </div>
          </div>
        </div>
        <ModeSwitcher mode={mode} onModeChange={setMode} />
      </div>

      {/* System Thought Stream */}
      <ThoughtStream thought={engine.currentThought} />

      {/* Phase Progress (16-phase) */}
      <PhaseTracker phases={phases} />

      {mode === "passive" ? (
        <PassiveView phases={phases} uptime={uptime} />
      ) : (
        <>
          {/* Event Feed */}
          <div ref={feedRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5 relative z-10">
            <AnimatePresence mode="popLayout">
              {engine.events.map((event, index) => (
                <EventCard key={event.id} event={event} index={index} />
              ))}
            </AnimatePresence>

            {engine.events.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <motion.div animate={{ opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 2, repeat: Infinity }}>
                  <Activity size={20} className="text-muted-foreground/20 mb-3" />
                </motion.div>
                <p className="text-[11px] text-muted-foreground/30">Awaiting orchestration events...</p>
              </div>
            )}
          </div>

          {/* Worker Cards */}
          <WorkerGrid workers={engine.workers} />
        </>
      )}
    </div>
  );
}

// ─── System Pulse ───────────────────────────────────────────────────────────

function SystemPulse({ load }: { load: number }) {
  return (
    <div className="relative w-6 h-6 flex items-center justify-center">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
        <motion.circle
          cx="12" cy="12" r="10" fill="none" stroke="#7C3AED" strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={2 * Math.PI * 10}
          animate={{ strokeDashoffset: 2 * Math.PI * 10 * (1 - load / 100) }}
          transition={{ duration: 1 }}
        />
      </svg>
      <motion.div
        className="absolute w-1 h-1 rounded-full bg-primary"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      />
    </div>
  );
}

// ─── Mode Switcher ──────────────────────────────────────────────────────────

function ModeSwitcher({ mode, onModeChange }: { mode: string; onModeChange: (m: "interactive" | "passive") => void }) {
  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-md surface-elevated border border-border">
      <button
        onClick={() => onModeChange("interactive")}
        className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] font-medium tracking-wider transition-all ${
          mode === "interactive"
            ? "bg-primary/10 text-primary border border-primary/20"
            : "text-muted-foreground/40 hover:text-muted-foreground border border-transparent"
        }`}
      >
        <Eye size={9} />
        <span>LIVE</span>
      </button>
      <button
        onClick={() => onModeChange("passive")}
        className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] font-medium tracking-wider transition-all ${
          mode === "passive"
            ? "bg-primary/10 text-primary border border-primary/20"
            : "text-muted-foreground/40 hover:text-muted-foreground border border-transparent"
        }`}
      >
        <EyeOff size={9} />
        <span>PASSIVE</span>
      </button>
    </div>
  );
}

// ─── Thought Stream ─────────────────────────────────────────────────────────

function ThoughtStream({ thought }: { thought: string }) {
  return (
    <div className="px-4 py-2 border-b border-border/50 relative z-10">
      <div className="flex items-center gap-2">
        <motion.div
          className="w-1 h-1 rounded-full bg-primary/60"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <AnimatePresence mode="wait">
          <motion.p
            key={thought}
            className="text-[10px] font-mono text-muted-foreground/50 truncate"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: duration.fast }}
          >
            {thought}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Phase Tracker (16-phase) ───────────────────────────────────────────────

function PhaseTracker({ phases }: { phases: { id: number; name: string; status: string; progress: number }[] }) {
  const activePhase = phases.find((p) => p.status === "active");
  const completedCount = phases.filter((p) => p.status === "completed").length;

  return (
    <div className="px-4 py-2.5 border-b border-border/50 relative z-10">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] font-medium tracking-[0.12em] uppercase text-muted-foreground/50">
          Pipeline Progress
        </span>
        <span className="text-[9px] font-mono text-muted-foreground/30">
          {completedCount}/{phases.length}
        </span>
      </div>
      {/* Phase bar */}
      <div className="flex gap-[2px] h-1.5 rounded-full overflow-hidden">
        {phases.map((phase) => (
          <motion.div
            key={phase.id}
            className="flex-1 rounded-full"
            style={{
              backgroundColor:
                phase.status === "completed" ? "#10B981" :
                phase.status === "active" ? "#7C3AED" :
                phase.status === "failed" ? "#EF4444" : "rgba(255,255,255,0.08)",
            }}
            animate={phase.status === "active" ? { opacity: [0.6, 1, 0.6] } : {}}
            transition={phase.status === "active" ? { duration: 1.5, repeat: Infinity } : {}}
          />
        ))}
      </div>
      {/* Active phase label */}
      {activePhase && (
        <div className="flex items-center gap-1.5 mt-1.5">
          <Loader2 size={9} className="text-primary animate-spin" />
          <span className="text-[9px] text-muted-foreground/60">
            Phase {activePhase.id}: {activePhase.name}
          </span>
          <span className="text-[8px] font-mono text-primary/60 ml-auto">{activePhase.progress}%</span>
        </div>
      )}
    </div>
  );
}

// ─── Event Card ─────────────────────────────────────────────────────────────

interface EventCardData {
  id: string;
  type: "captain" | "builder" | "validator" | "deployer" | "system";
  title: string;
  content: string;
  status: "active" | "completed" | "error" | "pending";
  timestamp: Date;
  progress?: number;
  details?: string;
  reasoning?: string[];
  handoffTo?: string;
}

function EventCard({ event, index }: { event: EventCardData; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = event.details || event.reasoning;

  return (
    <motion.div
      className="rounded-lg surface-elevated border border-border overflow-hidden"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: duration.normal, delay: index * 0.03, ease: ease.out }}
      layout
    >
      <div
        className={`flex items-start gap-2.5 px-3 py-2.5 ${hasDetails ? "cursor-pointer" : ""}`}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        {/* Status icon */}
        <div className="flex-shrink-0 mt-0.5">{getStatusIcon(event.status)}</div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            {getTypeIcon(event.type)}
            <span className="text-[9px] font-medium tracking-[0.1em] uppercase text-muted-foreground/50">
              {event.type}
            </span>
            {event.handoffTo && (
              <span className="text-[8px] text-primary/60 flex items-center gap-0.5">
                → {event.handoffTo}
              </span>
            )}
            <span className="text-[9px] text-muted-foreground/25 ml-auto font-mono tabular-nums">
              {event.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          </div>
          <h4 className="text-[11px] font-medium text-foreground/90 tracking-tight">{event.title}</h4>
          <p className="text-[10px] text-muted-foreground/60 leading-relaxed mt-0.5">{event.content}</p>

          {/* Progress bar */}
          {event.progress !== undefined && event.status === "active" && (
            <div className="mt-2 h-[3px] rounded-full bg-secondary overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-primary/60"
                animate={{ width: `${event.progress}%` }}
                transition={{ duration: 1 }}
              />
            </div>
          )}
        </div>

        {/* Expand */}
        {hasDetails && (
          <motion.div className="flex-shrink-0 mt-1 text-muted-foreground/30" animate={{ rotate: expanded ? 90 : 0 }}>
            <ChevronRight size={11} />
          </motion.div>
        )}
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: duration.fast }}
          >
            <div className="px-3 pb-3 ml-7 space-y-2">
              {event.details && (
                <div className="px-2.5 py-2 rounded-md bg-background border border-border text-[10px] text-muted-foreground/60 font-mono leading-relaxed">
                  {event.details}
                </div>
              )}
              {event.reasoning && (
                <div className="space-y-1">
                  <p className="text-[8px] tracking-[0.12em] uppercase text-muted-foreground/40 font-medium">Reasoning</p>
                  {event.reasoning.map((step, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <span className="text-[8px] text-primary/40 mt-0.5 font-mono">{i + 1}.</span>
                      <p className="text-[9px] text-muted-foreground/50 italic">{step}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Worker Grid ────────────────────────────────────────────────────────────

function WorkerGrid({ workers }: { workers: any[] }) {
  const activeWorkers = workers.filter((w) => w.status === "active" || w.status === "spawning" || w.status === "idle");

  return (
    <div className="border-t border-border px-3 py-3 relative z-10">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[9px] font-medium tracking-[0.12em] uppercase text-muted-foreground/50">
          Active Workers
        </h3>
        <div className="flex items-center gap-1.5">
          <motion.div
            className="w-1 h-1 rounded-full bg-[#10B981]"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
          <span className="text-[8px] font-mono text-muted-foreground/30">
            {activeWorkers.length}/{workers.length}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {workers.slice(0, 4).map((worker) => (
          <WorkerCard key={worker.id} worker={worker} />
        ))}
      </div>
    </div>
  );
}

function WorkerCard({ worker }: { worker: any }) {
  // Color-coded per worker type: Builder=blue, Validator=green, Research=purple, Captain=gold
  const workerColor = getWorkerColor(worker.name);
  const isActive = worker.status === "active";
  const statusColor = isActive ? workerColor : worker.status === "error" ? "#EF4444" : worker.status === "idle" ? "#7C3AED" : "#F59E0B";

  return (
    <motion.div
      className="relative px-2.5 py-2 rounded-md bg-background border border-border overflow-hidden"
      layout
    >
      {/* Active glow effect */}
      {isActive && (
        <motion.div
          className="absolute inset-0 rounded-md pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at 50% 0%, ${workerColor}15, transparent 70%)`,
            boxShadow: `inset 0 0 12px ${workerColor}10`,
          }}
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      <div className="relative z-10">
        <div className="flex items-center gap-1.5 mb-1">
          {/* Pulsing indicator */}
          <div className="relative">
            <motion.div
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: statusColor }}
              animate={isActive ? { scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] } : {}}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
            {isActive && (
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{ backgroundColor: statusColor }}
                animate={{ scale: [1, 2.5], opacity: [0.4, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            )}
          </div>
          <span className="text-[10px] font-medium text-foreground/80 truncate">{worker.name}</span>
          <span className="text-[8px] font-mono ml-auto" style={{ color: isActive ? workerColor : 'rgba(138,138,154,0.3)' }}>
            {worker.status === "active" ? "ACTIVE" : worker.status}
          </span>
        </div>
        {worker.provider && (
          <p className="text-[9px] text-muted-foreground/40 truncate">{worker.provider}</p>
        )}
        {worker.lastActivity && (
          <p className="text-[8px] text-muted-foreground/30 truncate mt-0.5">{worker.lastActivity}</p>
        )}
        {/* Thinking dots when active */}
        {isActive && (
          <div className="flex items-center gap-0.5 mt-1">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-1 h-1 rounded-full"
                style={{ backgroundColor: workerColor }}
                animate={{ opacity: [0.2, 0.8, 0.2], y: [0, -2, 0] }}
                transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
              />
            ))}
            <span className="text-[8px] text-muted-foreground/30 ml-1">processing</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function getWorkerColor(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("builder")) return "#3B82F6"; // Blue
  if (n.includes("validator")) return "#10B981"; // Green
  if (n.includes("research")) return "#8B5CF6"; // Purple
  if (n.includes("captain")) return "#F59E0B"; // Gold
  return "#7C3AED"; // Default indigo
}

// ─── Passive View ───────────────────────────────────────────────────────────

function PassiveView({ phases, uptime }: { phases: { status: string }[]; uptime: number }) {
  const completedCount = phases.filter((p) => p.status === "completed").length;
  const progress = (completedCount / phases.length) * 100;

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 py-12">
      <QIdentity size={64} state="idle" />
      <h2 className="font-display text-lg text-foreground/90 mt-6 mb-2">Working Autonomously</h2>
      <p className="text-[11px] text-muted-foreground/50 text-center mb-8 max-w-xs">
        Builders are executing tasks. Switch to Live mode for full visibility.
      </p>

      {/* Progress ring */}
      <div className="relative w-28 h-28 mb-6">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 112 112">
          <circle cx="56" cy="56" r="48" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
          <motion.circle
            cx="56" cy="56" r="48" fill="none" stroke="#7C3AED" strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 48}
            animate={{ strokeDashoffset: 2 * Math.PI * 48 * (1 - progress / 100) }}
            transition={{ duration: 1.5, ease: ease.out }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-xl text-foreground">{Math.round(progress)}%</span>
          <span className="text-[8px] text-muted-foreground/40 tracking-wider uppercase">Complete</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 w-full max-w-xs">
        <StatCard icon={<CheckCircle2 size={12} />} label="Phases Done" value={`${completedCount}/16`} />
        <StatCard icon={<Clock size={12} />} label="Uptime" value={formatUptime(uptime)} />
        <StatCard icon={<TrendingUp size={12} />} label="Status" value="Healthy" color="#10B981" />
        <StatCard icon={<Zap size={12} />} label="Workers" value="3 active" />
      </div>

      {/* Trust message */}
      <motion.div
        className="mt-6 flex items-center gap-2 px-3 py-1.5 rounded-full surface-elevated border border-border"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 3, repeat: Infinity }}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
        <span className="text-[9px] text-muted-foreground/40">All systems operational</span>
      </motion.div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-background border border-border">
      <div className="text-muted-foreground/40">{icon}</div>
      <div>
        <p className="text-[9px] text-muted-foreground/40">{label}</p>
        <p className="text-[11px] font-medium" style={{ color: color || "inherit" }}>{value}</p>
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function AmbientLayer() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {[...Array(4)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-px h-px rounded-full bg-primary/20"
          style={{ left: `${20 + i * 20}%`, top: `${25 + (i % 2) * 30}%` }}
          animate={{ y: [0, -20, 0], opacity: [0, 0.5, 0] }}
          transition={{ duration: 5 + i, repeat: Infinity, delay: i * 1.5 }}
        />
      ))}
      <motion.div
        className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/5 to-transparent"
        animate={{ top: ["0%", "100%"] }}
        transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
      />
    </div>
  );
}

function getStatusIcon(status: string) {
  switch (status) {
    case "completed": return <CheckCircle2 size={13} className="text-[#10B981]" />;
    case "active": return <Loader2 size={13} className="text-primary animate-spin" />;
    case "error": return <AlertCircle size={13} className="text-destructive" />;
    default: return <Circle size={13} className="text-muted-foreground/30" />;
  }
}

function getTypeIcon(type: string) {
  switch (type) {
    case "captain": return <Crown size={9} className="text-primary/60" />;
    case "builder": return <Cpu size={9} className="text-[#10B981]/60" />;
    case "validator": return <Shield size={9} className="text-[#F59E0B]/60" />;
    case "deployer": return <Rocket size={9} className="text-[#EC4899]/60" />;
    default: return <Activity size={9} className="text-muted-foreground/40" />;
  }
}

function UptimeDisplay({ seconds }: { seconds: number }) {
  return <span className="text-[8px] font-mono text-muted-foreground/25 tabular-nums">{formatUptime(seconds)}</span>;
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
