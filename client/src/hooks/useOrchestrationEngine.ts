/**
 * Q Workspace - Orchestration Engine Hook
 * 
 * Polls the database for real orchestration events and displays them.
 * Also shows events from the local orchestration store (from streaming).
 */
import { useState, useEffect, useRef } from "react";
import { useOrchestrationStore, useProjectStore, type Agent } from "@/stores";
import { trpc } from "@/lib/trpc";

interface EngineEvent {
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

interface EngineWorker {
  id: string;
  name: string;
  type: "captain" | "builder" | "validator" | "deployer";
  status: "idle" | "active" | "completed" | "error";
  provider: string;
  lastActivity?: string;
}

const SYSTEM_THOUGHTS = [
  "Monitoring worker pipeline status...",
  "Evaluating task routing priorities...",
  "Checking API availability across providers...",
  "Analyzing response quality metrics...",
  "Synchronizing orchestration state...",
  "Ready for next instruction...",
];

export function useOrchestrationEngine() {
  const { events: storeEvents, agents } = useOrchestrationStore();
  const { activeProject } = useProjectStore();
  const [currentThought, setCurrentThought] = useState(SYSTEM_THOUGHTS[0]);
  const [dbEvents, setDbEvents] = useState<EngineEvent[]>([]);
  const thoughtIndex = useRef(0);

  // Poll for real orchestration events from DB
  // Guard against NaN: activeProject.id may be a non-numeric string like "proj-1"
  const projectIdRaw = activeProject?.id ? parseInt(activeProject.id, 10) : NaN;
  const projectId = isNaN(projectIdRaw) ? undefined : projectIdRaw;
  const { data: serverEvents } = trpc.ai.getOrchestrationEvents.useQuery(
    { projectId: projectId ?? 0, limit: 20 },
    { enabled: !!projectId, refetchInterval: 3000 }
  );

  // Convert server events to EngineEvent format
  useEffect(() => {
    if (!serverEvents) return;
    const converted: EngineEvent[] = serverEvents.map((e: any) => ({
      id: String(e.id),
      type: mapEventType(e.agentName || e.eventType),
      title: e.agentName || e.eventType,
      content: e.summary || "",
      status: mapEventStatus(e.eventType),
      timestamp: new Date(e.createdAt),
    }));
    setDbEvents(converted);
  }, [serverEvents]);

  // Merge local store events with DB events
  const localEvents: EngineEvent[] = storeEvents.slice(-15).map((e: any) => ({
    id: e.id,
    type: mapEventType(e.payload?.worker || e.payload?.agentType || e.eventType),
    title: e.payload?.worker || e.eventType || "System",
    content: e.payload?.summary || e.payload?.task || e.eventType || "",
    status: e.eventType.includes("completed") ? "completed" as const : "active" as const,
    timestamp: new Date(e.timestamp),
  }));

  // Combine and deduplicate, most recent first
  const allEvents = [...localEvents, ...dbEvents]
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 20);

  // Rotate system thoughts
  useEffect(() => {
    const interval = setInterval(() => {
      thoughtIndex.current = (thoughtIndex.current + 1) % SYSTEM_THOUGHTS.length;
      setCurrentThought(SYSTEM_THOUGHTS[thoughtIndex.current]);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Fetch sprites/execution engine status
  const [spriteStatus, setSpriteStatus] = useState<string>("idle");
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/sprites/status");
        if (res.ok) {
          const data = await res.json();
          if (data.spriteStatus === "running") setSpriteStatus("active");
          else if (data.spriteStatus === "hibernated") setSpriteStatus("idle");
          else if (data.spriteStatus === "stopped") setSpriteStatus("idle");
          else setSpriteStatus(data.available ? "idle" : "error");
        }
      } catch { setSpriteStatus("idle"); }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  // Build workers from AI status
  const workers: EngineWorker[] = [
    {
      id: "captain",
      name: "Captain Q",
      type: "captain",
      status: getWorkerStatus("captain", allEvents),
      provider: "OpenAI GPT-4o",
      lastActivity: getLastActivity("captain", allEvents),
    },
    {
      id: "builder",
      name: "Builder",
      type: "builder",
      status: getWorkerStatus("builder", allEvents),
      provider: "OpenAI GPT-4o",
      lastActivity: getLastActivity("builder", allEvents),
    },
    {
      id: "validator",
      name: "Validator",
      type: "validator",
      status: getWorkerStatus("validator", allEvents),
      provider: "Anthropic Claude",
      lastActivity: getLastActivity("validator", allEvents),
    },
    {
      id: "executor",
      name: "Executor",
      type: "deployer",
      status: spriteStatus as EngineWorker["status"],
      provider: "Sprites.dev (Fly.io)",
      lastActivity: spriteStatus === "active" ? "Sprite running" : "Sprite cold/hibernated",
    },
    {
      id: "deployer",
      name: "Deployer",
      type: "deployer",
      status: getWorkerStatus("deployer", allEvents),
      provider: "Cloudflare Pages",
      lastActivity: getLastActivity("deployer", allEvents),
    },
  ];

  return {
    events: allEvents,
    currentThought,
    workers,
    activeEvents: allEvents.filter((e) => e.status === "active"),
  };
}

function mapEventType(name: string): EngineEvent["type"] {
  const lower = (name || "").toLowerCase();
  if (lower.includes("captain") || lower.includes("coordinator")) return "captain";
  if (lower.includes("builder") || lower.includes("openai") || lower.includes("build")) return "builder";
  if (lower.includes("validator") || lower.includes("anthropic") || lower.includes("claude")) return "validator";
  if (lower.includes("deploy") || lower.includes("cloudflare")) return "deployer";
  return "system";
}

function mapEventStatus(eventType: string): EngineEvent["status"] {
  if (eventType.includes("complete")) return "completed";
  if (eventType.includes("fail") || eventType.includes("error")) return "error";
  if (eventType.includes("start") || eventType.includes("spawn")) return "active";
  return "completed";
}

function getWorkerStatus(type: string, events: EngineEvent[]): EngineWorker["status"] {
  const recent = events.find(e => e.type === type);
  if (!recent) return "idle";
  if (recent.status === "active") return "active";
  if (recent.status === "error") return "error";
  return "completed";
}

function getLastActivity(type: string, events: EngineEvent[]): string | undefined {
  const recent = events.find(e => e.type === type);
  return recent?.content?.slice(0, 60);
}
