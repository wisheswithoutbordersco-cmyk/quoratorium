import { useMemo } from "react";
import { useOrchestrationStore, useProjectStore } from "@/stores";
import { trpc } from "@/lib/trpc";

export interface EngineEvent {
  id: string;
  type: "captain" | "builder" | "validator" | "deployer" | "system";
  title: string;
  content: string;
  status: "active" | "completed" | "error" | "pending";
  timestamp: Date;
  progress?: number;
}

export interface EngineWorker {
  id: string;
  name: string;
  type: EngineEvent["type"];
  status: "idle" | "active" | "completed" | "error";
  lastActivity?: string;
}

export function useOrchestrationEngine() {
  const storeEvents = useOrchestrationStore(state => state.events);
  const activeProject = useProjectStore(state => state.activeProject);
  const projectId = toNumericProjectId(activeProject?.id);
  const { data: serverEvents = [] } = trpc.ai.getOrchestrationEvents.useQuery(
    { projectId: projectId ?? 0, limit: 20 },
    { enabled: projectId !== null, refetchInterval: 3_000 }
  );
  const { data: jobsData } = trpc.jobs.list.useQuery(undefined, {
    refetchInterval: 5_000,
  });

  const events = useMemo(() => {
    const persisted: EngineEvent[] = serverEvents.map((event: any) => ({
      id: `event-${event.id}`,
      type: mapEventType(
        event.agent_name ||
          event.agentName ||
          event.event_type ||
          event.eventType
      ),
      title:
        event.agent_name ||
        event.agentName ||
        event.event_type ||
        event.eventType ||
        "Recorded activity",
      content: event.summary || "",
      status: mapEventStatus(event.event_type || event.eventType || ""),
      timestamp: new Date(event.created_at || event.createdAt),
    }));
    const local: EngineEvent[] = storeEvents
      .filter(event => event.projectId === activeProject?.id)
      .map(event => ({
        id: `local-${event.id}`,
        type: mapEventType(
          String(
            event.payload?.worker || event.payload?.agentType || event.eventType
          )
        ),
        title: String(event.payload?.worker || event.eventType),
        content: String(event.payload?.summary || event.payload?.task || ""),
        status: mapEventStatus(event.eventType),
        timestamp: new Date(event.timestamp),
      }));

    return [...persisted, ...local]
      .filter(
        (event, index, all) =>
          all.findIndex(candidate => candidate.id === event.id) === index
      )
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 20);
  }, [activeProject?.id, serverEvents, storeEvents]);

  const projectJobs = useMemo(
    () =>
      (jobsData?.jobs || []).filter((job: any) => {
        return projectId !== null && job.project_id === projectId;
      }),
    [jobsData?.jobs, projectId]
  );

  const workers = useMemo(
    () => deriveWorkers(events, projectJobs),
    [events, projectJobs]
  );
  const activeEvents = events.filter(event => event.status === "active");
  const currentThought =
    activeEvents[0]?.content ||
    events[0]?.content ||
    "No recorded orchestration activity for this project.";

  return {
    events,
    workers,
    activeEvents,
    currentThought,
    projectJobs,
    projectId,
  };
}

export function toNumericProjectId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0)
    return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const numeric = Number(value);
    return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
  }
  return null;
}

function deriveWorkers(
  events: EngineEvent[],
  jobs: Array<{ id: string; type: string; status: string }>
): EngineWorker[] {
  const byName = new Map<string, EngineWorker>();
  for (const event of events) {
    const key = event.title.trim().toLowerCase();
    if (!key || byName.has(key)) continue;
    byName.set(key, {
      id: `event-worker-${event.id}`,
      name: event.title,
      type: event.type,
      status: event.status === "pending" ? "idle" : event.status,
      lastActivity: event.content || undefined,
    });
  }
  for (const job of jobs) {
    const key = `job:${job.type}`;
    if (byName.has(key)) continue;
    byName.set(key, {
      id: `job-worker-${job.id}`,
      name: job.type.replace(/_/g, " "),
      type: "system",
      status:
        job.status === "processing" || job.status === "retrying"
          ? "active"
          : job.status === "failed" || job.status === "dead_letter"
            ? "error"
            : job.status === "completed"
              ? "completed"
              : "idle",
      lastActivity: `Tracked job: ${job.status}`,
    });
  }
  return Array.from(byName.values()).slice(0, 8);
}

function mapEventType(value: string): EngineEvent["type"] {
  const normalized = value.toLowerCase();
  if (
    normalized.includes("captain") ||
    normalized.includes("toriu") ||
    normalized.includes("coordinator")
  )
    return "captain";
  if (normalized.includes("builder") || normalized.includes("build"))
    return "builder";
  if (normalized.includes("validator") || normalized.includes("validation"))
    return "validator";
  if (normalized.includes("deploy")) return "deployer";
  return "system";
}

function mapEventStatus(value: string): EngineEvent["status"] {
  const normalized = value.toLowerCase();
  if (normalized.includes("fail") || normalized.includes("error"))
    return "error";
  if (
    normalized.includes("start") ||
    normalized.includes("spawn") ||
    normalized.includes("processing")
  )
    return "active";
  if (normalized.includes("pending") || normalized.includes("queue"))
    return "pending";
  return "completed";
}
