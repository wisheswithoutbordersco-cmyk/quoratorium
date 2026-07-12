/**
 * Q Workspace — Memory Page
 * Full-featured memory management: categories, importance, edit, teach, stats
 */
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, Plus, Search, Trash2, Loader2, Pencil, GraduationCap, Sparkles, AlertCircle, BookOpen, Lightbulb, Shield, Star, Clock } from "lucide-react";
import { TopNav } from "@/components/TopNav";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type Category = "context" | "preference" | "fact" | "instruction" | "insight" | "correction" | "project_summary";
type ModalMode = "create" | "edit" | "teach";

const CATEGORIES: { value: Category; label: string; icon: typeof Brain; color: string }[] = [
  { value: "correction", label: "Corrections", icon: AlertCircle, color: "text-red-400" },
  { value: "preference", label: "Preferences", icon: Star, color: "text-amber-400" },
  { value: "fact", label: "Facts", icon: BookOpen, color: "text-blue-400" },
  { value: "instruction", label: "Instructions", icon: Shield, color: "text-emerald-400" },
  { value: "insight", label: "Insights", icon: Lightbulb, color: "text-purple-400" },
  { value: "context", label: "Context", icon: Brain, color: "text-indigo-400" },
  { value: "project_summary", label: "Project", icon: Sparkles, color: "text-cyan-400" },
];

function getImportanceLabel(importance: number) {
  if (importance >= 9) return { label: "Critical", class: "bg-red-500/20 text-red-300" };
  if (importance >= 7) return { label: "High", class: "bg-amber-500/20 text-amber-300" };
  if (importance >= 5) return { label: "Medium", class: "bg-blue-500/20 text-blue-300" };
  return { label: "Low", class: "bg-muted text-muted-foreground" };
}

function getSourceBadge(source: string) {
  switch (source) {
    case "correction": return { label: "Auto-correction", class: "bg-red-500/10 text-red-400" };
    case "auto_extracted": return { label: "Auto-learned", class: "bg-purple-500/10 text-purple-400" };
    case "summary": return { label: "Summary", class: "bg-cyan-500/10 text-cyan-400" };
    default: return { label: "Manual", class: "bg-primary/10 text-primary" };
  }
}

function formatLastUsed(date: string | Date | null) {
  if (!date) return "Never used";
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "Used today";
  if (days === 1) return "Used yesterday";
  if (days < 7) return `Used ${days}d ago`;
  return `Used ${Math.floor(days / 7)}w ago`;
}

export default function Memory() {
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<Category | "all">("all");
  const [editingEntry, setEditingEntry] = useState<any>(null);
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    category: "preference" as Category,
    importance: 7,
    tags: [] as string[],
  });

  const { data: entries, isLoading } = trpc.memory.list.useQuery();
  const { data: stats } = trpc.memory.stats.useQuery();
  const utils = trpc.useUtils();

  const createEntry = trpc.memory.create.useMutation({
    onSuccess: () => {
      toast.success("Memory entry created");
      closeModal();
      utils.memory.list.invalidate();
      utils.memory.stats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateEntry = trpc.memory.update.useMutation({
    onSuccess: () => {
      toast.success("Memory updated");
      closeModal();
      utils.memory.list.invalidate();
      utils.memory.stats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteEntry = trpc.memory.delete.useMutation({
    onSuccess: () => {
      toast.success("Entry deleted");
      utils.memory.list.invalidate();
      utils.memory.stats.invalidate();
    },
  });

  const filtered = useMemo(() => {
    if (!entries) return [];
    return entries.filter((e) => {
      const matchesSearch =
        !search ||
        e.title.toLowerCase().includes(search.toLowerCase()) ||
        e.content.toLowerCase().includes(search.toLowerCase());
      const matchesFilter = activeFilter === "all" || e.category === activeFilter;
      return matchesSearch && matchesFilter;
    });
  }, [entries, search, activeFilter]);

  function openCreate() {
    setFormData({ title: "", content: "", category: "preference", importance: 7, tags: [] });
    setEditingEntry(null);
    setModalMode("create");
  }

  function openTeach() {
    setFormData({ title: "", content: "", category: "correction", importance: 9, tags: [] });
    setEditingEntry(null);
    setModalMode("teach");
  }

  function openEdit(entry: any) {
    setFormData({
      title: entry.title,
      content: entry.content,
      category: entry.category,
      importance: entry.importance,
      tags: entry.tags || [],
    });
    setEditingEntry(entry);
    setModalMode("edit");
  }

  function closeModal() {
    setModalMode(null);
    setEditingEntry(null);
  }

  function handleSave() {
    if (modalMode === "edit" && editingEntry) {
      updateEntry.mutate({ id: editingEntry.id, ...formData });
    } else {
      createEntry.mutate(formData);
    }
  }

  return (
    <div className="h-screen flex flex-col surface-base">
      <TopNav />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="font-display text-xl text-foreground tracking-tight flex items-center gap-2">
                <Brain size={18} className="text-primary/70" />
                Agent Memory
              </h1>
              <p className="text-[11px] text-muted-foreground/50 mt-1">
                Captain Q remembers your preferences, corrections, and context across sessions
              </p>
            </div>
            <div className="flex items-center gap-2">
              <motion.button
                onClick={openTeach}
                className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-primary/30 bg-primary/5 text-primary text-[11px] font-medium"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
              >
                <GraduationCap size={13} />
                Teach Captain
              </motion.button>
              <motion.button
                onClick={openCreate}
                className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-primary text-primary-foreground text-[11px] font-medium"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
              >
                <Plus size={13} />
                Add Memory
              </motion.button>
            </div>
          </div>

          {/* Stats Bar */}
          {stats && (
            <div className="grid grid-cols-4 gap-3 mb-6">
              <div className="p-3 rounded-xl surface-elevated border border-border">
                <div className="text-lg font-bold text-foreground">{stats.total}</div>
                <div className="text-[10px] text-muted-foreground/60">Total Memories</div>
              </div>
              <div className="p-3 rounded-xl surface-elevated border border-border">
                <div className="text-lg font-bold text-amber-400">{stats.highImportance}</div>
                <div className="text-[10px] text-muted-foreground/60">High Priority</div>
              </div>
              <div className="p-3 rounded-xl surface-elevated border border-border">
                <div className="text-lg font-bold text-emerald-400">{stats.recentlyUsed}</div>
                <div className="text-[10px] text-muted-foreground/60">Used This Week</div>
              </div>
              <div className="p-3 rounded-xl surface-elevated border border-border">
                <div className="text-lg font-bold text-purple-400">
                  {stats.byCategory?.["correction"] || 0}
                </div>
                <div className="text-[10px] text-muted-foreground/60">Corrections</div>
              </div>
            </div>
          )}

          {/* Search + Filter */}
          <div className="flex gap-3 mb-6">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search memories..."
                className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors"
              />
            </div>
          </div>

          {/* Category Tabs */}
          <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1">
            <button
              onClick={() => setActiveFilter("all")}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors ${
                activeFilter === "all"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/30 text-muted-foreground hover:text-foreground"
              }`}
            >
              All ({entries?.length || 0})
            </button>
            {CATEGORIES.map((cat) => {
              const count = entries?.filter((e) => e.category === cat.value).length || 0;
              if (count === 0 && activeFilter !== cat.value) return null;
              return (
                <button
                  key={cat.value}
                  onClick={() => setActiveFilter(cat.value)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                    activeFilter === cat.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/30 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <cat.icon size={11} />
                  {cat.label} ({count})
                </button>
              );
            })}
          </div>

          {/* Entries */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="animate-spin text-primary" size={24} />
            </div>
          ) : filtered.length > 0 ? (
            <div className="space-y-3">
              {filtered.map((entry, i) => {
                const imp = getImportanceLabel(entry.importance);
                const src = getSourceBadge((entry as any).source || "manual");
                const catInfo = CATEGORIES.find((c) => c.value === entry.category);
                return (
                  <motion.div
                    key={entry.id}
                    className="p-4 rounded-xl surface-elevated border border-border group hover:border-primary/20 transition-colors"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.02 }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          {catInfo && <catInfo.icon size={12} className={catInfo.color} />}
                          <span className="text-xs font-medium text-foreground truncate">{entry.title}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${imp.class}`}>
                            {imp.label}
                          </span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded ${src.class}`}>
                            {src.label}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground/70 whitespace-pre-wrap line-clamp-3">
                          {entry.content}
                        </p>
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-[9px] text-muted-foreground/40 flex items-center gap-1">
                            <Clock size={9} />
                            {formatLastUsed((entry as any).lastUsedAt)}
                          </span>
                          {(entry as any).useCount > 0 && (
                            <span className="text-[9px] text-muted-foreground/40">
                              Used {(entry as any).useCount}x
                            </span>
                          )}
                          {(() => {
                            const tags = entry.tags as string[] | null;
                            if (!tags || !Array.isArray(tags) || tags.length === 0) return null;
                            return (
                              <div className="flex gap-1">
                                {tags.slice(0, 3).map((tag: string) => (
                                  <span key={tag} className="text-[9px] px-1 py-0.5 rounded bg-muted/50 text-muted-foreground/60">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                        <button
                          onClick={() => openEdit(entry)}
                          className="p-1.5 rounded text-muted-foreground/40 hover:text-primary transition-colors"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => deleteEntry.mutate({ id: entry.id })}
                          className="p-1.5 rounded text-muted-foreground/40 hover:text-destructive transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-20">
              <Brain size={32} className="mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground/60">
                {search || activeFilter !== "all" ? "No matching memories" : "No memory entries yet"}
              </p>
              <p className="text-xs text-muted-foreground/40 mt-1">
                {search || activeFilter !== "all"
                  ? "Try adjusting your search or filter"
                  : "Teach Captain Q about your preferences and corrections"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit/Teach Modal */}
      <AnimatePresence>
        {modalMode && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => {
              // Only close if clicking directly on the backdrop, not on the modal
              if (e.target === e.currentTarget) {
                closeModal();
              }
            }}
          >
            <motion.div
              className="surface-elevated border border-border rounded-2xl p-6 w-full max-w-md mx-4"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-base font-display text-foreground mb-1 flex items-center gap-2">
                {modalMode === "teach" && <GraduationCap size={16} className="text-primary" />}
                {modalMode === "edit" && <Pencil size={16} className="text-primary" />}
                {modalMode === "create" && <Plus size={16} className="text-primary" />}
                {modalMode === "teach"
                  ? "Teach Captain Q"
                  : modalMode === "edit"
                  ? "Edit Memory"
                  : "Add Memory"}
              </h2>
              <p className="text-[10px] text-muted-foreground/50 mb-4">
                {modalMode === "teach"
                  ? "Tell Captain something it should always remember — corrections have highest priority"
                  : "Store context that persists across all sessions"}
              </p>

              <div className="space-y-3 mb-4">
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder={modalMode === "teach" ? "What should Captain remember?" : "Title"}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50"
                  autoFocus
                />
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder={
                    modalMode === "teach"
                      ? "e.g., Always use TypeScript strict mode. Never suggest jQuery. My company name is Acme Corp."
                      : "Content details"
                  }
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 resize-none h-24"
                />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-muted-foreground/60 mb-1 block">Category</label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value as Category })}
                      className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground outline-none focus:border-primary/50"
                    >
                      {CATEGORIES.map((cat) => (
                        <option key={cat.value} value={cat.value}>
                          {cat.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground/60 mb-1 block">
                      Importance ({formData.importance}/10)
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={formData.importance}
                      onChange={(e) => setFormData({ ...formData, importance: parseInt(e.target.value) })}
                      className="w-full mt-2 accent-primary"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={closeModal}
                  className="flex-1 py-2.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={
                    !formData.title.trim() ||
                    !formData.content.trim() ||
                    createEntry.isPending ||
                    updateEntry.isPending
                  }
                  className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50"
                >
                  {createEntry.isPending || updateEntry.isPending ? (
                    <Loader2 size={14} className="animate-spin mx-auto" />
                  ) : modalMode === "edit" ? (
                    "Update"
                  ) : modalMode === "teach" ? (
                    "Teach"
                  ) : (
                    "Save"
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
