import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Circle,
  Eye,
  EyeOff,
  Layers,
  Loader2,
} from "lucide-react";
import { useOrchestrationStore, useProjectStore } from "@/stores";
import {
  useOrchestrationEngine,
  type EngineEvent,
  type EngineWorker,
} from "@/hooks/useOrchestrationEngine";
import { duration, ease } from "@/lib/motion";

export function OrchestrationPanel() {
  const { mode, setMode } = useOrchestrationStore();
  const activeProject = useProjectStore(state => state.activeProject);
  const engine = useOrchestrationEngine();

  if (!activeProject || engine.projectId === null) {
    return (
      <EmptyPanel
        title="Select a persisted project"
        description="Project activity and tracked jobs appear here after a project with a numeric ID is selected."
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="min-w-0">
          <h2 className="text-[12px] font-display text-foreground tracking-tight">
            Orchestration
          </h2>
          <p className="mt-0.5 truncate text-[9px] uppercase tracking-wider text-muted-foreground/50">
            {engine.activeEvents.length} active event
            {engine.activeEvents.length === 1 ? "" : "s"} ·{" "}
            {engine.projectJobs.length} tracked job
            {engine.projectJobs.length === 1 ? "" : "s"}
          </p>
        </div>
        <ModeSwitcher mode={mode} onModeChange={setMode} />
      </header>

      <div className="px-4 py-2 border-b border-border/50">
        <p className="text-[10px] font-mono text-muted-foreground/55 truncate">
          {engine.currentThought}
        </p>
      </div>

      {mode === "passive" ? (
        <PassiveView events={engine.events} jobs={engine.projectJobs} />
      ) : (
        <>
          <section className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
            <AnimatePresence mode="popLayout">
              {engine.events.map((event, index) => (
                <EventCard key={event.id} event={event} index={index} />
              ))}
            </AnimatePresence>
            {engine.events.length === 0 && (
              <EmptyPanel
                title="No recorded activity"
                description="This project has no persisted orchestration events yet."
                compact
              />
            )}
          </section>
          <WorkerGrid workers={engine.workers} />
        </>
      )}
    </div>
  );
}

function ModeSwitcher({
  mode,
  onModeChange,
}: {
  mode: string;
  onModeChange: (mode: "interactive" | "passive") => void;
}) {
  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-md surface-elevated border border-border">
      <button
        onClick={() => onModeChange("interactive")}
        className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] font-medium tracking-wider transition-all ${mode === "interactive" ? "bg-primary/10 text-primary border border-primary/20" : "text-muted-foreground/40 hover:text-muted-foreground border border-transparent"}`}
      >
        <Eye size={9} />
        <span>LIVE</span>
      </button>
      <button
        onClick={() => onModeChange("passive")}
        className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] font-medium tracking-wider transition-all ${mode === "passive" ? "bg-primary/10 text-primary border border-primary/20" : "text-muted-foreground/40 hover:text-muted-foreground border border-transparent"}`}
      >
        <EyeOff size={9} />
        <span>SUMMARY</span>
      </button>
    </div>
  );
}

function EventCard({ event, index }: { event: EngineEvent; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = Boolean(event.content);
  return (
    <motion.div
      className="rounded-lg surface-elevated border border-border overflow-hidden"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{
        duration: duration.normal,
        delay: index * 0.03,
        ease: ease.out,
      }}
      layout
    >
      <button
        type="button"
        onClick={() => hasDetails && setExpanded(value => !value)}
        className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-left ${hasDetails ? "cursor-pointer" : "cursor-default"}`}
      >
        <div className="flex-shrink-0 mt-0.5">
          {getStatusIcon(event.status)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[9px] font-medium tracking-[0.1em] uppercase text-muted-foreground/50">
              {event.type}
            </span>
            <span className="text-[9px] text-muted-foreground/25 ml-auto font-mono tabular-nums">
              {event.timestamp.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          </div>
          <h3 className="text-[11px] font-medium text-foreground/90 tracking-tight">
            {event.title}
          </h3>
          {event.content && (
            <p className="text-[10px] text-muted-foreground/60 leading-relaxed mt-0.5 line-clamp-2">
              {event.content}
            </p>
          )}
        </div>
        {hasDetails && (
          <motion.div
            className="flex-shrink-0 mt-1 text-muted-foreground/30"
            animate={{ rotate: expanded ? 90 : 0 }}
          >
            <ChevronRight size={11} />
          </motion.div>
        )}
      </button>
      <AnimatePresence>
        {expanded && event.content && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: duration.fast }}
          >
            <p className="mx-3 mb-3 ml-9 rounded-md bg-background border border-border px-2.5 py-2 text-[10px] text-muted-foreground/60 leading-relaxed whitespace-pre-wrap">
              {event.content}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function WorkerGrid({ workers }: { workers: EngineWorker[] }) {
  if (workers.length === 0) return null;
  return (
    <section className="border-t border-border px-3 py-3">
      <h3 className="mb-2 text-[9px] font-medium tracking-[0.12em] uppercase text-muted-foreground/50">
        Observed workers
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {workers.map(worker => (
          <div
            key={worker.id}
            className="px-2.5 py-2 rounded-md bg-background border border-border"
          >
            <div className="flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${worker.status === "active" ? "bg-primary" : worker.status === "error" ? "bg-red-500" : worker.status === "completed" ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
              />
              <span className="min-w-0 truncate text-[10px] font-medium text-foreground/80">
                {worker.name}
              </span>
            </div>
            <p className="mt-1 truncate text-[8px] text-muted-foreground/35">
              {worker.lastActivity || worker.status}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function PassiveView({
  events,
  jobs,
}: {
  events: EngineEvent[];
  jobs: Array<{ status: string }>;
}) {
  const failed = jobs.filter(
    job => job.status === "failed" || job.status === "dead_letter"
  ).length;
  const active = jobs.filter(
    job => job.status === "processing" || job.status === "retrying"
  ).length;
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 py-12 text-center">
      <Layers size={30} className="text-muted-foreground/30 mb-4" />
      <h2 className="font-display text-lg text-foreground/90">
        Project activity summary
      </h2>
      <p className="mt-2 max-w-xs text-[11px] text-muted-foreground/50">
        This summary uses only persisted orchestration events and jobs
        associated with the selected project.
      </p>
      <div className="mt-6 grid grid-cols-3 gap-3 w-full max-w-sm">
        <Summary label="Events" value={String(events.length)} />
        <Summary label="Active jobs" value={String(active)} />
        <Summary label="Failed jobs" value={String(failed)} />
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-background border border-border px-2 py-2">
      <p className="text-[9px] text-muted-foreground/40">{label}</p>
      <p className="text-[12px] font-medium text-foreground">{value}</p>
    </div>
  );
}

function EmptyPanel({
  title,
  description,
  compact = false,
}: {
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${compact ? "py-16" : "h-full px-8"}`}
    >
      <Activity size={20} className="text-muted-foreground/20 mb-3" />
      <h3 className="text-[11px] font-medium text-foreground/75">{title}</h3>
      <p className="mt-1 max-w-xs text-[10px] leading-relaxed text-muted-foreground/45">
        {description}
      </p>
    </div>
  );
}

function getStatusIcon(status: EngineEvent["status"]) {
  if (status === "completed")
    return <CheckCircle2 size={13} className="text-emerald-500" />;
  if (status === "active")
    return <Loader2 size={13} className="text-primary animate-spin" />;
  if (status === "error")
    return <AlertCircle size={13} className="text-red-500" />;
  return <Circle size={13} className="text-muted-foreground/30" />;
}
