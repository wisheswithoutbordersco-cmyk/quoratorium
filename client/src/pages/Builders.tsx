/**
 * Q Workspace — Builders Page
 * AI workforce management — shows real agent activity from orchestration events
 */
import { motion } from "framer-motion";
import { Bot, Cpu, Shield, Rocket, Activity, Loader2 } from "lucide-react";
import { TopNav } from "@/components/TopNav";
import { trpc } from "@/lib/trpc";
import { useOrchestrationStore } from "@/stores";

// Static builder definitions (these are the AI workers in the system)
const builderDefs = [
  {
    id: "captain",
    name: "Captain Q",
    type: "Orchestrator",
    icon: Bot,
    capabilities: ["Planning", "Routing", "Analysis", "Coordination"],
    description: "Routes tasks to appropriate workers and manages execution plans",
  },
  {
    id: "builder",
    name: "Builder",
    type: "Executor",
    icon: Cpu,
    capabilities: ["React", "TypeScript", "Tailwind", "Node.js", "Python"],
    description: "Generates production-ready code and content",
  },
  {
    id: "validator",
    name: "Validator",
    type: "Quality",
    icon: Shield,
    capabilities: ["Accessibility", "Performance", "Security", "Best Practices"],
    description: "Reviews and validates generated output for quality",
  },
  {
    id: "deployer",
    name: "Deployer",
    type: "Operations",
    icon: Rocket,
    capabilities: ["CDN", "SSL", "DNS", "Build Optimization"],
    description: "Handles deployment pipeline and infrastructure",
  },
];

export default function Builders() {
  const { data: recentActivity, isLoading } = trpc.projects.getRecentActivity.useQuery({ limit: 50 });
  const { agents } = useOrchestrationStore();

  // Compute stats from real orchestration events
  const getAgentStats = (agentId: string) => {
    if (!recentActivity) return { tasksCompleted: 0, lastTask: "Awaiting tasks" };
    
    const agentName = agentId === "captain" ? "Captain Q" : 
                      agentId === "builder" ? "Builder" :
                      agentId === "validator" ? "Validator" : "Deployer";
    
    const agentEvents = recentActivity.filter(e => 
      e.agentName?.toLowerCase().includes(agentName.toLowerCase())
    );
    
    const completedEvents = agentEvents.filter(e => 
      e.eventType.includes("complete") || e.eventType.includes("response")
    );

    const lastTask = agentEvents[0]?.summary || "Awaiting tasks";
    
    return {
      tasksCompleted: completedEvents.length,
      lastTask: lastTask.slice(0, 80),
    };
  };

  // Determine if an agent is currently active based on store state
  const isAgentActive = (agentId: string) => {
    const storeAgent = agents.find(a => a.id === agentId || a.type.toLowerCase().includes(agentId));
    return storeAgent?.status === "active";
  };

  return (
    <div className="h-screen flex flex-col surface-base">
      <TopNav />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="font-display text-xl text-foreground tracking-tight flex items-center gap-2">
                <Bot size={18} className="text-primary/70" />
                Builders
              </h1>
              <p className="text-[11px] text-muted-foreground/50 mt-1">
                AI workforce management — {builderDefs.length} agents in pool
              </p>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg surface-elevated border border-border">
              <Activity size={12} className="text-[#10B981]" />
              <span className="text-[10px] text-muted-foreground/60">Pool Health: Optimal</span>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin text-primary" size={24} />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {builderDefs.map((builder, index) => {
                const Icon = builder.icon;
                const stats = getAgentStats(builder.id);
                const active = isAgentActive(builder.id);

                return (
                  <motion.div
                    key={builder.id}
                    className="rounded-xl surface-elevated border border-border overflow-hidden"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.06 }}
                  >
                    <div className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 rounded-lg surface-overlay">
                          <Icon size={16} className="text-primary/70" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-[13px] font-medium text-foreground">{builder.name}</h3>
                          <p className="text-[9px] text-muted-foreground/40">{builder.type} Agent</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className={`w-2 h-2 rounded-full ${active ? "bg-[#10B981] animate-pulse" : "bg-muted-foreground/20"}`} />
                          <span className="text-[9px] text-muted-foreground/40 capitalize">{active ? "active" : "idle"}</span>
                        </div>
                      </div>

                      {/* Current/Last task */}
                      <div className="px-3 py-2 rounded-lg surface-overlay border border-border mb-3">
                        <span className="text-[9px] text-muted-foreground/30 uppercase tracking-wider">Last Task</span>
                        <p className="text-[11px] text-foreground/70 mt-0.5 truncate">{stats.lastTask}</p>
                      </div>

                      {/* Stats */}
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="text-center">
                          <p className="text-[14px] font-display text-foreground">{stats.tasksCompleted}</p>
                          <p className="text-[8px] text-muted-foreground/30">Completed</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[14px] font-display text-foreground">{builder.capabilities.length}</p>
                          <p className="text-[8px] text-muted-foreground/30">Capabilities</p>
                        </div>
                      </div>

                      {/* Capabilities */}
                      <div className="flex flex-wrap gap-1.5">
                        {builder.capabilities.map((cap) => (
                          <span key={cap} className="px-2 py-0.5 rounded text-[9px] surface-overlay border border-border text-muted-foreground/50">
                            {cap}
                          </span>
                        ))}
                      </div>

                      {/* Description */}
                      <p className="text-[9px] text-muted-foreground/30 mt-3">{builder.description}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
