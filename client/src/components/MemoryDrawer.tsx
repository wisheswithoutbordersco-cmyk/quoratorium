/**
 * Memory Drawer — Slide-out panel showing protected memories grouped by category
 * Part of Patent 1: Two-Tier Sandboxed Memory System
 */
import { useState } from "react";
import { useUIStore } from "@/stores";
import { trpc } from "@/lib/trpc";
import { Brain, X, Shield, Trash2, Search } from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  credential: "Credentials",
  name: "Names & Contacts",
  number: "Numbers",
  business_decision: "Business Decisions",
  deadline: "Deadlines",
  preference: "Preferences",
  requirement: "Requirements",
  action_item: "Action Items",
  project_context: "Project Context",
  personal_info: "Personal Info",
};

const CATEGORY_ICONS: Record<string, string> = {
  credential: "🔑",
  name: "👤",
  number: "#️⃣",
  business_decision: "📋",
  deadline: "⏰",
  preference: "⭐",
  requirement: "📌",
  action_item: "✅",
  project_context: "🏗️",
  personal_info: "🏠",
};

export function MemoryDrawer() {
  const { memoryDrawerOpen, toggleMemoryDrawer } = useUIStore();
  const [search, setSearch] = useState("");

  // Fetch protected memories
  const { data: memories, isLoading } = trpc.globalMemory.getUserMemories.useQuery(
    undefined,
    { enabled: memoryDrawerOpen }
  );

  if (!memoryDrawerOpen) return null;

  // Group memories by category
  const grouped: Record<string, typeof memories> = {};
  if (memories) {
    for (const mem of memories) {
      const cat = mem.category || "general";
      if (!grouped[cat]) grouped[cat] = [];
      if (!search || mem.key.toLowerCase().includes(search.toLowerCase()) || 
          (typeof mem.value === "object" && mem.value?.text?.toLowerCase().includes(search.toLowerCase()))) {
        grouped[cat].push(mem);
      }
    }
  }

  const totalCount = memories?.length || 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
        onClick={toggleMemoryDrawer}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-[380px] max-w-[90vw] z-50 flex flex-col bg-[#0a0a0a] border-l border-white/5">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400/80" />
            <span className="text-sm font-medium text-white/90">Protected Memory</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/50">
              {totalCount}
            </span>
          </div>
          <button
            onClick={toggleMemoryDrawer}
            className="p-1.5 rounded hover:bg-white/5 text-white/40 hover:text-white/80 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b border-white/5">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
            <input
              type="text"
              placeholder="Search memories..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white/5 border border-white/5 rounded text-white/80 placeholder:text-white/30 focus:outline-none focus:border-white/10"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-white/10 border-t-white/40 rounded-full animate-spin" />
            </div>
          ) : totalCount === 0 ? (
            <div className="text-center py-12">
              <Brain className="w-8 h-8 text-white/10 mx-auto mb-3" />
              <p className="text-xs text-white/30">No protected memories yet</p>
              <p className="text-[10px] text-white/20 mt-1">
                Captain Q will auto-save important information here
              </p>
            </div>
          ) : (
            Object.entries(grouped).map(([category, items]) => {
              if (!items || items.length === 0) return null;
              return (
                <div key={category} className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] text-white/40 uppercase tracking-wider font-medium">
                    <span>{CATEGORY_ICONS[category] || "📝"}</span>
                    <span>{CATEGORY_LABELS[category] || category}</span>
                    <span className="text-white/20">({items.length})</span>
                  </div>
                  {items.map((mem) => (
                    <MemoryCard key={mem.id} memory={mem} />
                  ))}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-white/5 flex items-center justify-between">
          <span className="text-[10px] text-white/20">
            Inner Sandbox • Never deleted
          </span>
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 animate-pulse" />
            <span className="text-[10px] text-emerald-400/60">Active</span>
          </div>
        </div>
      </div>
    </>
  );
}

function MemoryCard({ memory }: { memory: any }) {
  const utils = trpc.useUtils();
  const deleteMutation = trpc.globalMemory.deleteUserMemory.useMutation({
    onSuccess: () => utils.globalMemory.getUserMemories.invalidate(),
  });

  const value = typeof memory.value === "object" && memory.value?.text
    ? memory.value.text
    : typeof memory.value === "string"
      ? memory.value
      : JSON.stringify(memory.value);

  return (
    <div className="group relative p-2.5 rounded bg-white/[0.02] border border-white/5 hover:border-white/10 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-white/70 truncate">{memory.key}</p>
          <p className="text-[10px] text-white/40 mt-0.5 line-clamp-2">{value}</p>
        </div>
        <button
          onClick={() => deleteMutation.mutate({ id: memory.id })}
          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/10 text-white/20 hover:text-red-400/80 transition-all"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      {memory.confidence && (
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-0.5 flex-1 rounded bg-white/5 overflow-hidden">
            <div
              className="h-full bg-emerald-400/30 rounded"
              style={{ width: `${(memory.confidence || 0) * 100}%` }}
            />
          </div>
          <span className="text-[9px] text-white/20">{Math.round((memory.confidence || 0) * 100)}%</span>
        </div>
      )}
    </div>
  );
}
