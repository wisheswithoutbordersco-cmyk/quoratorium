/**
 * Q Workspace — Project/Conversation Sidebar
 * Shows conversation history, project list, search, and new chat button
 */
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { useProjectStore, useConversationStore } from "@/stores";
import { useLocation } from "wouter";
import {
  Plus, Search, FolderKanban, MessageSquare, Clock,
  CheckCircle2, AlertCircle, Loader2, ChevronRight,
  PanelLeftClose, PanelLeftOpen, Trash2,
} from "lucide-react";
import { duration, ease } from "@/lib/motion";

type SidebarTab = "conversations" | "projects";

interface ProjectSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  /** Called after a conversation is selected (used by mobile drawer to close itself) */
  onConversationSelect?: () => void;
}

export function ProjectSidebar({ collapsed, onToggle, onConversationSelect }: ProjectSidebarProps) {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<SidebarTab>("conversations");
  const { setActiveProject } = useProjectStore();
  const { setActiveConversationId, setMessages, activeConversationId } = useConversationStore();
  const { data: projects, isLoading: projectsLoading } = trpc.projects.list.useQuery();
  const { data: conversations, isLoading: convsLoading } = trpc.conversations.list.useQuery(undefined, { refetchInterval: 5000 });
  const utils = trpc.useUtils();
  const loadConversation = {
    mutate: async (input: { id: number }) => {
      try {
        const res = await fetch(`/api/trpc/conversations.get?input=${encodeURIComponent(JSON.stringify(input))}`, {
          credentials: "include",
        });
        const json = await res.json();
        const data = json?.result?.data;
        if (data) {
          setActiveConversationId(data.id.toString());
          const msgs = data.messages.map((m: any) => ({
            id: m.id.toString(),
            role: m.role as "user" | "assistant",
            content: m.content,
            timestamp: new Date(m.createdAt),
          }));
          setMessages(msgs);
        }
      } catch { /* ignore */ }
    },
  };
  const deleteConversation = trpc.conversations.delete.useMutation({
    onSuccess: () => {
      utils.conversations.list.invalidate();
    },
  });

  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    if (!search.trim()) return projects;
    const q = search.toLowerCase();
    return projects.filter(
      (p: any) => p.name.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q)
    );
  }, [projects, search]);

  const filteredConversations = useMemo(() => {
    if (!conversations) return [];
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter(
      (c: any) => (c.title || "").toLowerCase().includes(q)
    );
  }, [conversations, search]);

  const handleSelectProject = (project: any) => {
    setActiveProject({
      id: project.id.toString(),
      name: project.name,
      description: project.description || "",
      currentPhase: project.currentPhase || 1,
      status: project.status || "active",
      createdAt: new Date(project.createdAt),
      updatedAt: new Date(project.updatedAt || project.createdAt),
    });
    if (window.location.pathname !== "/workspace") {
      setLocation("/workspace");
    }
  };

  const handleNewChat = () => {
    setActiveConversationId(null);
    setMessages([]);
    if (window.location.pathname !== "/workspace") {
      setLocation("/workspace");
    }
  };

  const handleSelectConversation = (conv: any) => {
    loadConversation.mutate({ id: conv.id });
    if (window.location.pathname !== "/workspace") {
      setLocation("/workspace");
    }
    onConversationSelect?.();
  };

  const handleDeleteConversation = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    deleteConversation.mutate({ id });
    if (activeConversationId === id.toString()) {
      handleNewChat();
    }
  };

  const handleNewProject = () => {
    setLocation("/workspace/projects");
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle2 size={10} className="text-emerald-400" />;
      case "active": return <Loader2 size={10} className="text-primary animate-spin" />;
      case "failed": return <AlertCircle size={10} className="text-red-400" />;
      default: return <Clock size={10} className="text-muted-foreground/50" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "#10B981";
      case "active": return "#6366F1";
      case "failed": return "#EF4444";
      default: return "#8A8A9A";
    }
  };

  return (
    <motion.div
      className="h-full border-r border-border flex flex-col surface-base relative"
      animate={{ width: collapsed ? 48 : 260 }}
      transition={{ duration: duration.normal, ease: ease.out }}
    >
      {/* Toggle button */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-14 z-20 w-6 h-6 rounded-full surface-elevated border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors"
      >
        {collapsed ? <PanelLeftOpen size={10} /> : <PanelLeftClose size={10} />}
      </button>

      {collapsed ? (
        /* Collapsed state */
        <div className="flex flex-col items-center pt-4 gap-3">
          <motion.button
            onClick={handleNewChat}
            className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors"
            whileTap={{ scale: 0.9 }}
            title="New Chat"
          >
            <Plus size={14} />
          </motion.button>
          <div className="w-6 h-px bg-border" />
          {/* Mini conversation indicators */}
          {(conversations || []).slice(0, 6).map((conv: any) => (
            <motion.button
              key={conv.id}
              onClick={() => handleSelectConversation(conv)}
              className={`w-8 h-8 rounded-lg surface-elevated border flex items-center justify-center hover:border-primary/30 transition-colors ${
                activeConversationId === conv.id.toString() ? "border-primary/50 bg-primary/10" : "border-border"
              }`}
              whileTap={{ scale: 0.9 }}
              title={conv.title || "Untitled"}
            >
              <MessageSquare size={11} className="text-muted-foreground/60" />
            </motion.button>
          ))}
          <div className="w-6 h-px bg-border" />
          {(projects || []).slice(0, 4).map((project: any) => (
            <motion.button
              key={project.id}
              onClick={() => handleSelectProject(project)}
              className="w-8 h-8 rounded-lg surface-elevated border border-border flex items-center justify-center hover:border-primary/30 transition-colors group"
              whileTap={{ scale: 0.9 }}
              title={project.name}
            >
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getStatusColor(project.status) }} />
            </motion.button>
          ))}
        </div>
      ) : (
        /* Expanded state */
        <>
          {/* New Chat Button */}
          <div className="p-3 border-b border-border">
            <motion.button
              onClick={handleNewChat}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-[11px] font-medium hover:bg-primary/20 transition-colors"
              whileTap={{ scale: 0.97 }}
            >
              <Plus size={12} />
              New Chat
            </motion.button>
          </div>

          {/* Tab Switcher */}
          <div className="px-3 py-2 flex gap-1">
            <button
              onClick={() => setTab("conversations")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[10px] font-medium transition-all ${
                tab === "conversations"
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-muted-foreground/50 hover:text-muted-foreground border border-transparent"
              }`}
            >
              <MessageSquare size={10} />
              Chats
            </button>
            <button
              onClick={() => setTab("projects")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[10px] font-medium transition-all ${
                tab === "projects"
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-muted-foreground/50 hover:text-muted-foreground border border-transparent"
              }`}
            >
              <FolderKanban size={10} />
              Projects
            </button>
          </div>

          {/* Search */}
          <div className="px-3 py-1">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-secondary border border-border">
              <Search size={11} className="text-muted-foreground/50" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tab === "conversations" ? "Search conversations..." : "Search projects..."}
                className="flex-1 bg-transparent text-[11px] text-foreground placeholder:text-muted-foreground/40 outline-none"
              />
            </div>
          </div>

          {/* Content List */}
          <div className="flex-1 overflow-y-auto px-2 py-1">
            {tab === "conversations" ? (
              convsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={16} className="animate-spin text-primary/50" />
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare size={20} className="mx-auto text-muted-foreground/20 mb-2" />
                  <p className="text-[10px] text-muted-foreground/40">
                    {search ? "No matches" : "No conversations yet"}
                  </p>
                  <p className="text-[9px] text-muted-foreground/30 mt-1">
                    Start chatting to create one
                  </p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {filteredConversations.map((conv: any, i: number) => (
                    <motion.button
                      key={conv.id}
                      onClick={() => handleSelectConversation(conv)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors group relative ${
                        activeConversationId === conv.id.toString()
                          ? "bg-primary/10 border border-primary/20"
                          : "hover:bg-secondary/60 border border-transparent"
                      }`}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                    >
                      <div className="flex items-center gap-2">
                        <MessageSquare size={10} className="text-primary/50 shrink-0" />
                        <span className="text-[11px] text-foreground/80 font-medium truncate flex-1 group-hover:text-foreground transition-colors">
                          {conv.title || "Untitled Chat"}
                        </span>
                        <button
                          onClick={(e) => handleDeleteConversation(e, conv.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground/40 hover:text-red-400 transition-all"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 mt-1 pl-5">
                        <span className="text-[9px] text-muted-foreground/40">
                          {formatTimeAgo(new Date(conv.updatedAt || conv.createdAt))}
                        </span>
                        {conv.messageCount && (
                          <span className="text-[9px] text-muted-foreground/30">
                            {conv.messageCount} msgs
                          </span>
                        )}
                      </div>
                    </motion.button>
                  ))}
                </div>
              )
            ) : (
              projectsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={16} className="animate-spin text-primary/50" />
                </div>
              ) : filteredProjects.length === 0 ? (
                <div className="text-center py-8">
                  <FolderKanban size={20} className="mx-auto text-muted-foreground/20 mb-2" />
                  <p className="text-[10px] text-muted-foreground/40">
                    {search ? "No matches" : "No projects yet"}
                  </p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {filteredProjects.map((project: any, i: number) => (
                    <motion.button
                      key={project.id}
                      onClick={() => handleSelectProject(project)}
                      className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-secondary/60 transition-colors group"
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                    >
                      <div className="flex items-center gap-2">
                        {getStatusIcon(project.status)}
                        <span className="text-[11px] text-foreground/80 font-medium truncate flex-1 group-hover:text-foreground transition-colors">
                          {project.name}
                        </span>
                        <ChevronRight size={10} className="text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div className="flex items-center gap-2 mt-1 pl-5">
                        <span className="text-[9px] text-muted-foreground/40">
                          {formatTimeAgo(new Date(project.createdAt))}
                        </span>
                        {project.description && (
                          <span className="text-[9px] text-muted-foreground/30 truncate max-w-[120px]">
                            {project.description}
                          </span>
                        )}
                      </div>
                    </motion.button>
                  ))}
                </div>
              )
            )}
          </div>

          {/* Footer */}
          <div className="px-3 py-2 border-t border-border">
            <div className="flex items-center justify-between">
              <motion.button
                onClick={handleNewProject}
                className="flex items-center gap-1.5 px-2 py-1 rounded text-[9px] text-muted-foreground/50 hover:text-primary transition-colors"
                whileTap={{ scale: 0.95 }}
              >
                <Plus size={9} />
                New Project
              </motion.button>
              <span className="flex items-center gap-1 text-[9px] text-muted-foreground/30">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/60" />
                Online
              </span>
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
}

function formatTimeAgo(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return minutes + "m";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + "h";
  return Math.floor(hours / 24) + "d";
}
