/**
 * Q Workspace — Vault Page
 * Real tRPC integration for secure file/config storage
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Key, Plus, Shield, Lock, Search, Trash2, Loader2, FileText } from "lucide-react";
import { TopNav } from "@/components/TopNav";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function Vault() {
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
  const [revealContent, setRevealContent] = useState(false);
  const [newEntry, setNewEntry] = useState({ name: "", content: "", entryType: "credential" as const });

  const { data: entries, isLoading } = trpc.vault.list.useQuery();
  const utils = trpc.useUtils();
  const selectedEntry = entries?.find((entry) => entry.id === selectedEntryId) ?? null;

  const createEntry = trpc.vault.create.useMutation({
    onSuccess: () => {
      toast.success("Vault entry created");
      setShowCreate(false);
      setNewEntry({ name: "", content: "", entryType: "credential" });
      utils.vault.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteEntry = trpc.vault.delete.useMutation({
    onSuccess: () => {
      toast.success("Entry deleted");
      utils.vault.list.invalidate();
    },
  });

  const filtered = entries?.filter(
    (e) => e.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="h-screen flex flex-col surface-base">
      <TopNav />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="font-display text-xl text-foreground tracking-tight flex items-center gap-2">
                <Lock size={18} className="text-primary/70" />
                Vault
              </h1>
              <p className="text-[11px] text-muted-foreground/50 mt-1">
                Tap an entry to view its saved content
              </p>
            </div>
            <motion.button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-primary text-primary-foreground text-[11px] font-medium"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              <Plus size={13} />
              Add Entry
            </motion.button>
          </div>

          {/* Security indicator */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg surface-elevated border border-[#10B981]/20 mb-6">
            <Shield size={12} className="text-[#10B981]" />
            <span className="text-[10px] text-[#10B981]/80 font-medium">
              Encrypted storage · Database-backed persistence
            </span>
          </div>

          {/* Search */}
          <div className="relative mb-6">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search vault..."
              className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors"
            />
          </div>

          {/* Entries */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="animate-spin text-primary" size={24} />
            </div>
          ) : filtered && filtered.length > 0 ? (
            <div className="space-y-2.5">
              {filtered.map((item, index) => (
                <motion.div
                  key={item.id}
                  className="group flex items-center gap-2 rounded-xl surface-elevated border border-border hover:border-primary/20 transition-colors p-2"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: index * 0.05 }}
                >
                  <motion.button
                    type="button"
                    aria-label={`View ${item.name}, ${item.entry_type}`}
                    onClick={() => {
                      setSelectedEntryId(item.id);
                      setRevealContent(false);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-4 rounded-lg p-2 text-left select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    whileTap={{ scale: 0.995 }}
                  >
                    <div className="w-9 h-9 rounded-lg surface-overlay border border-border flex items-center justify-center flex-shrink-0">
                      {item.entry_type === "credential" ? (
                        <Key size={14} className="text-primary/60" />
                      ) : (
                        <FileText size={14} className="text-primary/60" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="truncate text-[13px] font-medium text-foreground">{item.name}</h4>
                        <span className="flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary/70">
                          {item.entry_type}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground/50 truncate max-w-md">
                        {item.entry_type === "credential" ? "••••••••••" : (item.content || "").slice(0, 80)}
                      </p>
                    </div>
                  </motion.button>

                  <button
                    type="button"
                    aria-label={`Delete ${item.name}`}
                    title={`Delete ${item.name}`}
                    onClick={() => deleteEntry.mutate({ id: item.id })}
                    className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground/50 hover:text-destructive transition-colors opacity-70 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <Trash2 size={14} />
                  </button>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-20">
              <Lock size={32} className="mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground/60">Vault is empty</p>
              <p className="text-xs text-muted-foreground/40 mt-1">Store secrets and configurations securely</p>
            </div>
          )}
        </div>
      </div>

      {/* Entry Details */}
      <Dialog
        open={Boolean(selectedEntry)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedEntryId(null);
            setRevealContent(false);
          }
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto surface-elevated border-border sm:max-w-lg">
          {selectedEntry && (
            <>
              <DialogHeader className="pr-8 text-left">
                <DialogTitle className="break-words text-left">{selectedEntry.name}</DialogTitle>
                <DialogDescription>
                  {selectedEntry.entry_type} vault entry
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium text-muted-foreground">Saved content</p>
                  {selectedEntry.entry_type === "credential" && (
                    <button
                      type="button"
                      aria-label={revealContent ? "Hide secret value" : "Reveal secret value"}
                      aria-pressed={revealContent}
                      onClick={() => setRevealContent((visible) => !visible)}
                      className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {revealContent ? <EyeOff size={14} /> : <Eye size={14} />}
                      {revealContent ? "Hide" : "Show"}
                    </button>
                  )}
                </div>
                <div className="max-h-[50dvh] min-h-16 overflow-auto rounded-lg border border-border bg-background p-3">
                  <pre className="whitespace-pre-wrap break-words font-mono text-sm text-foreground select-text">
                    {selectedEntry.entry_type === "credential" && !revealContent && selectedEntry.content
                      ? "••••••••••"
                      : selectedEntry.content || "No content stored for this entry."}
                  </pre>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowCreate(false)}
          >
            <motion.div
              className="surface-elevated border border-border rounded-2xl p-6 w-full max-w-md mx-4"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-base font-display text-foreground mb-4">Add Vault Entry</h2>
              <div className="space-y-3 mb-4">
                <input
                  type="text"
                  value={newEntry.name}
                  onChange={(e) => setNewEntry({ ...newEntry, name: e.target.value })}
                  placeholder="Entry name (e.g., OpenAI API Key)"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50"
                  autoFocus
                />
                <textarea
                  value={newEntry.content}
                  onChange={(e) => setNewEntry({ ...newEntry, content: e.target.value })}
                  placeholder="Content or secret value"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 resize-none h-24 font-mono"
                />
                <select
                  value={newEntry.entryType}
                  onChange={(e) => setNewEntry({ ...newEntry, entryType: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground outline-none focus:border-primary/50"
                >
                  <option value="credential">Credential / API Key</option>
                  <option value="config">Configuration</option>
                  <option value="note">Secure Note</option>
                  <option value="file">File Reference</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="flex-1 py-2.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => createEntry.mutate(newEntry)}
                  disabled={!newEntry.name.trim() || !newEntry.content.trim() || createEntry.isPending}
                  className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50"
                >
                  {createEntry.isPending ? <Loader2 size={14} className="animate-spin mx-auto" /> : "Save"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
