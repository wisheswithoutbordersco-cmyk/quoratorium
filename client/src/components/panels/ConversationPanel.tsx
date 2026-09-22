/**
 * Q Workspace - Conversation Panel (The Cognitive Zone)
 * Uses SSE streaming for real-time token-by-token AI responses.
 */
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Paperclip,
  X,
  FileText,
  Image,
  File,
  Github,
  PanelLeft,
  Volume2,
  Square,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Download,
  Maximize2,
  Rocket,
} from "lucide-react";
import { PushToGitHub } from "@/components/PushToGitHub";
import { Streamdown } from "streamdown";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { HolographicCode } from "@/components/HolographicCode";
import { LivePreview } from "@/components/LivePreview";
import { DeployModal } from "@/components/DeployModal";
import { ToriuAvatar } from "@/components/ToriuAvatar";
import {
  useConversationStore,
  useOrchestrationStore,
  type Message,
} from "@/stores";
import { duration, ease } from "@/lib/motion";
import { nanoid } from "nanoid";
import { useProjectStore, useUIStore } from "@/stores";
import { useAuth } from "@/_core/hooks/useAuth";
import { CreditExhaustedBanner } from "@/components/CreditExhaustedBanner";
import { BusinessActionPanel } from "@/components/BusinessActionPanel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MAX_CHAT_ATTACHMENTS,
  MAX_CHAT_IMAGE_BYTES,
  MAX_CHAT_TOTAL_IMAGE_BYTES,
} from "@shared/chatLimits";

// Only database-issued numeric IDs may be sent to tRPC project endpoints.
// This prevents local placeholder IDs such as "proj-1" from being treated as persisted projects.
const safeParseInt = (val: string | null | undefined): number | undefined => {
  if (!val || !/^\d+$/.test(val)) return undefined;
  const n = Number(val);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
};

const SUPPORTED_CHAT_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

let activeVoiceAudio: HTMLAudioElement | null = null;
let activeVoiceUrl: string | null = null;
let activeVoiceRequestController: AbortController | null = null;

function stopActiveVoiceAudio() {
  activeVoiceRequestController?.abort();
  activeVoiceRequestController = null;
  if (activeVoiceAudio) {
    activeVoiceAudio.pause();
    activeVoiceAudio.currentTime = 0;
    activeVoiceAudio = null;
  }
  if (activeVoiceUrl) {
    URL.revokeObjectURL(activeVoiceUrl);
    activeVoiceUrl = null;
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("q:toriu-voice-stop"));
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () =>
      reject(reader.error || new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
}

interface ConversationPanelProps {
  /** Called when the mobile sidebar button is pressed */
  onMobileSidebarOpen?: () => void;
}

export function ConversationPanel({
  onMobileSidebarOpen,
}: ConversationPanelProps = {}) {
  const {
    messages,
    isTyping,
    pendingUploads,
    addMessage,
    updateMessage,
    setTyping,
    addUpload,
    removeUpload,
    clearUploads,
    activeConversationId,
    setActiveConversationId,
  } = useConversationStore();
  const { addEvent } = useOrchestrationStore();
  const { activeProject } = useProjectStore();
  const { getToken } = useAuth();
  const [input, setInput] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null
  );
  const [autoPlayMessageId, setAutoPlayMessageId] = useState<string | null>(
    null
  );
  const [activeMemoryCount, setActiveMemoryCount] = useState(0);
  const [activeKnowledgeSources, setActiveKnowledgeSources] = useState<
    string[]
  >([]);
  const [creditExhausted, setCreditExhausted] = useState<{
    plan: string;
    dailyLimit: number;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  // Keep the server-issued ID available synchronously between React renders so
  // a rapid follow-up cannot accidentally start a second conversation.
  const activeConversationIdRef = useRef<string | null>(activeConversationId);
  const [livePreviewCode, setLivePreviewCode] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showDeployModal, setShowDeployModal] = useState(false);
  const handleVoiceStarted = useCallback(() => setAutoPlayMessageId(null), []);
  const utils = trpc.useUtils();
  const persistedProjectId = safeParseInt(activeProject?.id);
  const {
    data: persistedProjectFiles,
    isLoading: isCheckingSavedProjectFiles,
  } = trpc.projects.getFiles.useQuery(
    { projectId: persistedProjectId ?? 0 },
    { enabled: persistedProjectId !== undefined }
  );
  const hasSavedProjectFiles =
    persistedProjectFiles?.some(
      file => typeof file.content === "string" && file.content.trim().length > 0
    ) ?? false;
  const canDeploySavedProject =
    persistedProjectId !== undefined && hasSavedProjectFiles;

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
    setAutoPlayMessageId(null);
    stopActiveVoiceAudio();
  }, [activeConversationId]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      stopActiveVoiceAudio();
      setTyping(false);
    };
  }, [setTyping]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isTyping]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  useEffect(() => {
    if (messages.length === 0 && !activeConversationId) {
      const hour = new Date().getHours();
      const greeting =
        hour < 12
          ? "Morning, Lee."
          : hour < 17
            ? "What's up, Lee."
            : "Evening, Lee.";
      addMessage({
        id: nanoid(),
        role: "assistant",
        content: greeting + " What can I do for you?",
        timestamp: new Date(),
      });
    }
  }, [activeConversationId, messages.length, addMessage]);

  const handleSend = useCallback(async () => {
    if (!input.trim() && pendingUploads.length === 0) return;

    setAutoPlayMessageId(null);
    stopActiveVoiceAudio();

    // Clear credit exhaustion banner when user sends a new message
    setCreditExhausted(null);

    const userMessage: Message = {
      id: nanoid(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
      attachments: pendingUploads.length > 0 ? [...pendingUploads] : undefined,
    };
    addMessage(userMessage);
    const messageText = input.trim();
    setInput("");
    clearUploads();
    setTyping(true);
    setActiveMemoryCount(0);
    setActiveKnowledgeSources([]);

    addEvent({
      id: nanoid(),
      projectId: activeProject?.id || "general",
      eventType: "agent_spawned",
      payload: { agentType: "coordinator", task: messageText.slice(0, 100) },
      timestamp: new Date(),
    });

    // The streaming endpoint is the single source of truth for persistence.
    // Send the current conversation when present; for a new chat the server
    // creates it and returns its authoritative ID in an SSE event.
    streamResponse(
      messageText,
      safeParseInt(activeConversationIdRef.current),
      userMessage.attachments
    );
  }, [input, pendingUploads, activeProject]);

  const streamResponse = async (
    messageText: string,
    conversationId?: number,
    attachments = pendingUploads
  ) => {
    const assistantId = nanoid();
    addMessage({
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
    });
    setStreamingMessageId(assistantId);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const history = messages
        .filter(m => m.role === "user" || m.role === "assistant")
        .slice(-10)
        .map(m => {
          const imageAttachments =
            m.attachments?.filter(
              attachment =>
                (attachment.dataUrl || attachment.url) &&
                attachment.type.startsWith("image/")
            ) || [];
          if (m.role === "user" && imageAttachments.length > 0) {
            return {
              role: m.role,
              content: [
                {
                  type: "text",
                  text: m.content || "Please describe the attached image.",
                },
                ...imageAttachments.map(attachment => ({
                  type: "image_url",
                  image_url: {
                    url: attachment.dataUrl || attachment.url!,
                    detail: "high",
                  },
                })),
              ],
            };
          }
          return { role: m.role, content: m.content };
        });

      const streamUrl = conversationId
        ? `/api/stream/chat?conversationId=${encodeURIComponent(String(conversationId))}`
        : "/api/stream/chat";

      const token = await getToken();
      const response = await fetch(streamUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        signal: controller.signal,
        body: JSON.stringify({
          message: messageText,
          projectId: safeParseInt(activeProject?.id),
          history,
          attachments,
        }),
      });

      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let accumulated = "";
      let accumulatedImages: Array<{ url: string; title?: string }> = [];
      // Buffer for incomplete SSE lines that span multiple network reads
      let lineBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Prepend any leftover partial line from the previous chunk
        const text = lineBuffer + decoder.decode(value, { stream: true });
        const rawLines = text.split("\n");
        // The last element may be an incomplete line — carry it over
        lineBuffer = rawLines.pop() ?? "";

        for (const line of rawLines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") break;

          try {
            const event = JSON.parse(data);
            if (event.type === "conversation_id") {
              const serverConversationId = safeParseInt(
                String(event.conversationId)
              );
              if (serverConversationId !== undefined) {
                activeConversationIdRef.current = String(serverConversationId);
                setActiveConversationId(String(serverConversationId));
                // Refresh immediately so the server-created conversation appears
                // in the sidebar while the assistant response is still streaming.
                void utils.conversations.list.invalidate();
              }
            } else if (event.type === "start") {
              addEvent({
                id: nanoid(),
                projectId: activeProject?.id || "general",
                eventType: "agent_spawned",
                payload: { worker: event.worker, intent: event.intent },
                timestamp: new Date(),
              });
            } else if (event.type === "memory_active") {
              setActiveMemoryCount(event.count || 0);
              addEvent({
                id: nanoid(),
                projectId: activeProject?.id || "general",
                eventType: "agent_spawned",
                payload: {
                  agentType: "memory",
                  summary: `Checking memory... found ${event.count} relevant entries`,
                },
                timestamp: new Date(),
              });
            } else if (event.type === "knowledge_active") {
              setActiveKnowledgeSources(event.sources || []);
              addEvent({
                id: nanoid(),
                projectId: activeProject?.id || "general",
                eventType: "agent_spawned",
                payload: {
                  agentType: "knowledge",
                  summary: `Using knowledge from: ${(event.sources || []).join(", ")}`,
                },
                timestamp: new Date(),
              });
            } else if (event.type === "token") {
              accumulated += event.content;
              updateMessage(assistantId, { content: accumulated });
            } else if (event.type === "image") {
              // Keep image payloads structured. Markdown renderers commonly reject
              // data URLs, and embedding base64 in text exposes the raw payload.
              if (typeof event.url === "string" && event.url) {
                accumulatedImages = [
                  ...accumulatedImages,
                  { url: event.url, title: event.title || "Generated image" },
                ];
                updateMessage(assistantId, {
                  content: accumulated,
                  images: accumulatedImages,
                });
              }
            } else if (event.type === "execution") {
              // Code execution result
              const execIcon = event.success ? "✅" : "❌";
              const execInfo = `\n\n${execIcon} **${event.language}** execution (${event.duration}ms)\n`;
              accumulated += execInfo;
              updateMessage(assistantId, { content: accumulated });
            } else if (event.type === "progress") {
              // Multi-step progress
              addEvent({
                id: nanoid(),
                projectId: activeProject?.id || "general",
                eventType: "agent_spawned",
                payload: {
                  step: event.step,
                  total: event.total,
                  name: event.name,
                  status: event.status,
                },
                timestamp: new Date(),
              });
            } else if (event.type === "tool_mode") {
              // Toríu entered/exited autonomous tool-use mode
              if (event.active) {
                accumulated += "\n\n🛠️ **Using tools autonomously...**\n";
                updateMessage(assistantId, { content: accumulated });
              } else if (event.toolsUsed?.length) {
                accumulated += `\n\n✅ **Tools used:** ${event.toolsUsed.join(", ")}\n`;
                updateMessage(assistantId, { content: accumulated });
              }
            } else if (event.type === "tool_start") {
              // A specific tool is being invoked
              const toolLabels: Record<string, string> = {
                create_file: "📝 Creating file",
                execute_code: "⚡ Running code",
                web_research: "🔍 Researching",
                deploy_project: "🚀 Deploying",
              };
              const label = toolLabels[event.tool] || `🔧 ${event.tool}`;
              accumulated += `\n${label}...\n`;
              updateMessage(assistantId, { content: accumulated });
              addEvent({
                id: nanoid(),
                projectId: activeProject?.id || "general",
                eventType: "agent_spawned",
                payload: {
                  agentType: "tool",
                  tool: event.tool,
                  summary: label,
                },
                timestamp: new Date(),
              });
            } else if (event.type === "tool_result") {
              if (event.data?.businessAction) {
                void utils.businessActions.list.invalidate();
              }
              if (event.data?.githubProposal) {
                void utils.git.proposals.invalidate();
              }
              // Tool completed. Image artifacts are transported separately from
              // prose so they render reliably even when their source is a data URL.
              const imageArtifacts = Array.isArray(event.artifacts)
                ? event.artifacts.filter(
                    (artifact: any) =>
                      artifact?.type === "image" &&
                      typeof artifact.url === "string"
                  )
                : [];
              if (imageArtifacts.length > 0) {
                accumulatedImages = [
                  ...accumulatedImages,
                  ...imageArtifacts.map((artifact: any) => ({
                    url: artifact.url,
                    title: artifact.name || "Generated image",
                  })),
                ];
              }
              const icon = event.success ? "✅" : "❌";
              accumulated += `${icon} Done\n`;
              updateMessage(assistantId, {
                content: accumulated,
                images: accumulatedImages,
              });
            } else if (event.type === "sandbox_url") {
              // A live sandbox URL was produced — open it in preview
              accumulated += `\n\n🌐 **Live Preview:** [${event.name || "View Project"}](${event.url})\n`;
              updateMessage(assistantId, { content: accumulated });
              // Open the sandbox URL in the workspace preview panel
              useUIStore
                .getState()
                .openPreview(
                  `<iframe src="${event.url}" style="width:100%;height:100%;border:none;"></iframe>`,
                  event.name || "Live Preview"
                );
            } else if (event.type === "error") {
              // Check for credit exhaustion
              if (event.credit_exhausted) {
                setCreditExhausted({
                  plan: event.plan || "free",
                  dailyLimit: 25,
                });
                updateMessage(assistantId, { content: "" }); // Clear the empty assistant message
              } else {
                accumulated = event.content;
                updateMessage(assistantId, { content: accumulated });
              }
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }

      addEvent({
        id: nanoid(),
        projectId: activeProject?.id || "general",
        eventType: "agent_completed",
        payload: {
          agentType: "coordinator",
          summary: accumulated.slice(0, 100),
        },
        timestamp: new Date(),
      });

      // The server persists the complete assistant response before ending the
      // stream. Refresh the sidebar so its updated timestamp/order is visible.
      void utils.conversations.list.invalidate();

      // Detect code blocks for live preview panel
      // Extracts the first substantial HTML/TSX/JSX code block and opens the workspace preview
      const codeBlockRegex =
        /```(?:html|htm|tsx|jsx)(?:\s+([^\n]+))?\n([\s\S]*?)```/;
      const codeMatch = accumulated.match(codeBlockRegex);
      if (codeMatch) {
        const fileName = codeMatch[1]?.trim() || "preview.html";
        const code = codeMatch[2];
        // Open the workspace split-pane preview
        useUIStore.getState().openPreview(code, fileName);
        // Also keep the local state for the inline preview (backward compat)
        setLivePreviewCode(code);
        setShowPreview(true);
      }

      if (accumulated.trim()) {
        setAutoPlayMessageId(assistantId);
      }
    } catch (error: any) {
      if (error.name === "AbortError") return;
      updateMessage(assistantId, {
        content:
          "I encountered an issue: " + (error.message || "Please try again."),
      });
    } finally {
      setTyping(false);
      setStreamingMessageId(null);
      abortControllerRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const queueFiles = useCallback(
    async (files: File[]) => {
      let queuedImageBytes = pendingUploads
        .filter(attachment => attachment.type.startsWith("image/"))
        .reduce((total, attachment) => total + attachment.size, 0);
      const remainingSlots = Math.max(
        0,
        MAX_CHAT_ATTACHMENTS - pendingUploads.length
      );
      if (files.length > remainingSlots) {
        toast.error(
          `Toríu accepts up to ${MAX_CHAT_ATTACHMENTS} attachments per message.`
        );
      }
      for (const file of files.slice(0, remainingSlots)) {
        if (
          file.type.startsWith("image/") &&
          !SUPPORTED_CHAT_IMAGE_TYPES.has(file.type)
        ) {
          toast.error(
            "That image type is not supported. Please use PNG, JPG, WEBP, or GIF."
          );
          continue;
        }
        if (
          file.type.startsWith("image/") &&
          file.size > MAX_CHAT_IMAGE_BYTES
        ) {
          toast.error(
            "That image is too large. Please choose one under 10 MB."
          );
          continue;
        }
        if (
          file.type.startsWith("image/") &&
          queuedImageBytes + file.size > MAX_CHAT_TOTAL_IMAGE_BYTES
        ) {
          toast.error(
            "Those images are too large together. Please keep attachments under 20 MB total."
          );
          continue;
        }

        try {
          const dataUrl = file.type.startsWith("image/")
            ? await readFileAsDataUrl(file)
            : undefined;
          addUpload({
            id: nanoid(),
            name: file.name,
            type: file.type,
            size: file.size,
            dataUrl,
          });
          if (file.type.startsWith("image/")) queuedImageBytes += file.size;
        } catch {
          toast.error(
            `I couldn't read ${file.name}. Please try attaching it again.`
          );
        }
      }
    },
    [addUpload, pendingUploads]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      void queueFiles(Array.from(e.dataTransfer.files));
    },
    [queueFiles]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    void queueFiles(Array.from(e.target.files || []));
    e.target.value = "";
  };

  return (
    <div
      className="flex flex-col h-full"
      onDragOver={e => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <AnimatePresence>
        {isDragging && (
          <motion.div
            className="absolute inset-0 z-50 bg-primary/5 border-2 border-dashed border-primary/30 rounded-xl flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <p className="text-sm text-primary font-medium">Drop files here</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto px-3 sm:px-4 lg:px-4 py-4 space-y-4">
        {/* Memory Active Indicator */}
        <AnimatePresence>
          {activeMemoryCount > 0 && isTyping && (
            <motion.div
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/10 mb-2"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              <span className="text-[11px]">🧠</span>
              <span className="text-[10px] text-primary/70 font-medium">
                Using {activeMemoryCount}{" "}
                {activeMemoryCount === 1 ? "memory" : "memories"}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {activeKnowledgeSources.length > 0 && isTyping && (
            <motion.div
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/5 border border-emerald-500/10 mb-2"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              <span className="text-[11px]">📚</span>
              <span className="text-[10px] text-emerald-400/70 font-medium">
                Using knowledge from: {activeKnowledgeSources.join(", ")}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="popLayout">
          {messages.map(msg => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isStreaming={msg.id === streamingMessageId}
              autoPlayVoice={msg.id === autoPlayMessageId}
              onVoiceStarted={handleVoiceStarted}
            />
          ))}
        </AnimatePresence>

        {isTyping && !streamingMessageId && (
          <motion.div
            className="flex items-center gap-2 px-3 py-2"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
          >
            <div className="relative">
              <ToriuAvatar size={18} active />
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{ boxShadow: "0 0 8px 2px rgba(255,255,255,0.15)" }}
                animate={{ opacity: [0.3, 0.8, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            </div>
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <motion.div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-white/40"
                    animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.1, 0.8] }}
                    transition={{
                      duration: 0.9,
                      repeat: Infinity,
                      delay: i * 0.2,
                    }}
                  />
                ))}
              </div>
              <span className="text-[10px] text-white/30 font-medium tracking-wider">
                PROCESSING
              </span>
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <BusinessActionPanel
        conversationId={safeParseInt(activeConversationId) ?? null}
      />

      <AnimatePresence>
        {pendingUploads.length > 0 && (
          <motion.div
            className="px-4 py-2 border-t border-border flex gap-2 flex-wrap"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            {pendingUploads.map(upload => (
              <div
                key={upload.id}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md surface-elevated border border-border text-[10px]"
              >
                <FileIcon type={upload.type} />
                <span className="text-foreground/70 max-w-[100px] truncate">
                  {upload.name}
                </span>
                <button
                  onClick={() => removeUpload(upload.id)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live Preview Panel */}
      <AnimatePresence>
        {showPreview && livePreviewCode && (
          <motion.div
            className="border-t border-border"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 300, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <LivePreview
              code={livePreviewCode}
              onClose={() => setShowPreview(false)}
            />
            <div className="px-3 py-2 border-t border-border flex items-center justify-between gap-3">
              <p className="text-[10px] text-muted-foreground/50">
                {canDeploySavedProject
                  ? "This inline preview is local; deployment uses saved project files."
                  : isCheckingSavedProjectFiles
                    ? "Checking whether this project has saved files…"
                    : "This inline preview is local. Save project files before deployment is available."}
              </p>
              {canDeploySavedProject && (
                <button
                  onClick={() => setShowDeployModal(true)}
                  className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md bg-orange-500/10 border border-orange-500/20 text-[10px] text-purple-400 hover:bg-orange-500/20 transition-colors"
                  title="Deploy saved project files"
                >
                  <Rocket size={11} />
                  Deploy saved project
                </button>
              )}
            </div>
            {showDeployModal &&
              canDeploySavedProject &&
              activeProject &&
              persistedProjectId !== undefined && (
                <DeployModal
                  projectId={persistedProjectId}
                  projectName={activeProject.name}
                  onClose={() => setShowDeployModal(false)}
                />
              )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Credit Exhaustion Banner */}
      {creditExhausted && (
        <CreditExhaustedBanner
          plan={creditExhausted.plan}
          dailyLimit={creditExhausted.dailyLimit}
        />
      )}

      <div className="px-3 sm:px-4 py-3 border-t border-border">
        <div className="flex items-end gap-2 surface-elevated rounded-xl px-3 py-2 border border-border focus-within:border-primary/30 transition-colors">
          {/* Mobile: sidebar button to open conversation list */}
          {onMobileSidebarOpen && (
            <button
              onClick={onMobileSidebarOpen}
              className="p-2 sm:p-1.5 text-muted-foreground hover:text-primary transition-colors md:hidden"
              aria-label="Open conversations"
            >
              <PanelLeft size={16} className="sm:w-3.5 sm:h-3.5" />
            </button>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 sm:p-1.5 text-muted-foreground hover:text-primary transition-colors"
          >
            <Paperclip size={16} className="sm:w-3.5 sm:h-3.5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={handleFileSelect}
          />
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Toríu to build, research, or validate..."
            className="flex-1 bg-transparent text-base sm:text-sm text-foreground placeholder:text-muted-foreground/40 resize-none outline-none max-h-[120px] min-h-[44px] sm:min-h-0 py-2 sm:py-0"
            rows={1}
          />
          <motion.button
            onClick={handleSend}
            disabled={!input.trim() && pendingUploads.length === 0}
            className="p-2 sm:p-1.5 text-primary disabled:text-muted-foreground/30 transition-colors"
            whileTap={{ scale: 0.9 }}
          >
            <Send size={16} className="sm:w-3.5 sm:h-3.5" />
          </motion.button>
        </div>
        <p className="text-[9px] text-muted-foreground/30 mt-1.5 text-center">
          Provider and model are selected for each request based on availability
          and task fit.
        </p>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  isStreaming,
  autoPlayVoice = false,
  onVoiceStarted,
}: {
  message: Message;
  isStreaming?: boolean;
  autoPlayVoice?: boolean;
  onVoiceStarted?: () => void;
}) {
  const isUser = message.role === "user";
  const [showPushDialog, setShowPushDialog] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(
    null
  );

  // Extract code blocks from assistant messages for push-to-github
  const codeFiles = useMemo(() => {
    if (isUser || isStreaming) return [];
    const blocks: { path: string; content: string }[] = [];
    const regex = /```(\w+)?(?:\s+([^\n]+))?\n([\s\S]*?)```/g;
    let match;
    while ((match = regex.exec(message.content)) !== null) {
      const lang = match[1] || "text";
      const filename =
        match[2] || `file${blocks.length + 1}.${langToExt(lang)}`;
      blocks.push({ path: filename, content: match[3] });
    }
    return blocks;
  }, [message.content, isUser, isStreaming]);

  const hasCode = codeFiles.length > 0;
  const generatedImages = message.images || [];
  const selectedImage =
    selectedImageIndex === null ? null : generatedImages[selectedImageIndex];

  return (
    <motion.div
      className={"flex " + (isUser ? "justify-end" : "justify-start")}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.fast }}
      layout
    >
      <div
        className={
          "max-w-[90%] sm:max-w-[85%] " + (isUser ? "order-2" : "order-1")
        }
      >
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-1">
            <ToriuAvatar size={18} />
            <span className="text-[9px] text-primary/60 font-medium tracking-wider uppercase">
              Toríu
            </span>
          </div>
        )}
        <div
          className={
            "rounded-xl px-3.5 py-2.5 text-sm sm:text-[13px] leading-relaxed " +
            (isUser
              ? "bg-primary text-primary-foreground"
              : "surface-elevated border border-border text-foreground")
          }
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose prose-invert prose-sm max-w-none">
              {isStreaming && message.content.includes("```") ? (
                <HolographicCode
                  code={message.content}
                  isStreaming={isStreaming}
                />
              ) : (
                <>
                  <Streamdown>
                    {message.content || (isStreaming ? " " : "")}
                  </Streamdown>
                  {generatedImages.length > 0 && (
                    <div
                      className={`mt-3 grid gap-2 not-prose ${
                        generatedImages.length === 1
                          ? "max-w-xl grid-cols-1"
                          : "grid-cols-2 xl:grid-cols-3"
                      }`}
                    >
                      {generatedImages.map((image, index) => (
                        <button
                          key={`${image.url.slice(0, 80)}-${index}`}
                          type="button"
                          onClick={() => setSelectedImageIndex(index)}
                          className={`group relative overflow-hidden rounded-xl border border-white/10 bg-black/35 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 ${
                            generatedImages.length === 1
                              ? "h-56 sm:h-72 lg:h-80"
                              : "aspect-[4/3]"
                          }`}
                          aria-label={`View ${image.title || `generated image ${index + 1}`} full size`}
                        >
                          <img
                            src={image.url}
                            alt={image.title || `Generated image ${index + 1}`}
                            className="block h-full w-full object-contain"
                            loading="lazy"
                          />
                          <span className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-3 pb-2 pt-8 text-xs text-white opacity-90 transition-opacity group-hover:opacity-100">
                            <span className="truncate">
                              {image.title || `Image ${index + 1}`}
                            </span>
                            <span className="flex shrink-0 items-center gap-1 font-medium">
                              <Maximize2 className="h-3.5 w-3.5" />
                              View full
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {isStreaming && (
                    <motion.span
                      className="inline-block w-0.5 h-3.5 bg-white/60 ml-0.5 align-middle"
                      animate={{ opacity: [1, 0, 1] }}
                      transition={{ duration: 0.7, repeat: Infinity }}
                    />
                  )}
                </>
              )}
            </div>
          )}
          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {message.attachments.map((att: any) => (
                <div
                  key={att.id}
                  className="overflow-hidden rounded bg-white/10 text-[10px]"
                >
                  {(att.dataUrl || att.url) &&
                    att.type?.startsWith("image/") && (
                      <img
                        src={att.dataUrl || att.url}
                        alt={att.name}
                        className="block max-h-48 w-auto max-w-full object-contain"
                      />
                    )}
                  <div className="flex items-center gap-1 px-2 py-1">
                    <FileIcon type={att.type} />
                    <span className="truncate max-w-[120px]">{att.name}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* Voice TTS button - shown on assistant messages */}
          {!isUser && !isStreaming && message.content && (
            <VoiceButton
              text={message.content}
              autoPlay={autoPlayVoice}
              onAutoPlayStarted={onVoiceStarted}
            />
          )}
          {/* Push to GitHub button - shown after code generation */}
          {hasCode && !isStreaming && (
            <div className="mt-3 pt-2 border-t border-white/5">
              <button
                onClick={() => setShowPushDialog(!showPushDialog)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-orange-500/10 border border-white/10 hover:border-orange-500/20 text-[11px] text-white/60 hover:text-orange-300 transition-all"
              >
                <Github className="w-3.5 h-3.5" />
                Push to GitHub
                <span className="text-[10px] text-white/30 ml-1">
                  ({codeFiles.length} file{codeFiles.length !== 1 ? "s" : ""})
                </span>
              </button>
            </div>
          )}
        </div>
        {/* Push to GitHub Dialog */}
        {showPushDialog && hasCode && (
          <PushToGitHub
            files={codeFiles}
            contextSummary={message.content.slice(0, 200)}
            onClose={() => setShowPushDialog(false)}
          />
        )}
        <p className="text-[9px] text-muted-foreground/30 mt-0.5 px-1">
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>

      <Dialog
        open={selectedImageIndex !== null}
        onOpenChange={open => !open && setSelectedImageIndex(null)}
      >
        <DialogContent className="grid h-[94vh] w-[96vw] max-w-[96vw] grid-rows-[auto_minmax(0,1fr)_auto] gap-3 overflow-hidden bg-black/95 p-3 sm:max-w-[96vw] sm:p-4">
          <div className="min-w-0 pr-10">
            <DialogTitle className="truncate text-base text-white">
              {selectedImage?.title || "Generated image"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Complete generated image preview. Use the controls below to move
              between images, open the original, or download it.
            </DialogDescription>
            {generatedImages.length > 1 && (
              <p className="mt-1 text-xs text-white/55">
                Image {(selectedImageIndex ?? 0) + 1} of{" "}
                {generatedImages.length}
              </p>
            )}
          </div>

          <div className="relative flex min-h-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black">
            {selectedImage && (
              <img
                src={selectedImage.url}
                alt={
                  selectedImage.title ||
                  `Generated image ${(selectedImageIndex ?? 0) + 1}`
                }
                className="max-h-full max-w-full object-contain"
              />
            )}

            {generatedImages.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedImageIndex(current =>
                      current === null
                        ? 0
                        : (current - 1 + generatedImages.length) %
                          generatedImages.length
                    )
                  }
                  className="absolute left-2 rounded-full border border-white/15 bg-black/70 p-2 text-white transition-colors hover:bg-black/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label="Previous image"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedImageIndex(current =>
                      current === null
                        ? 0
                        : (current + 1) % generatedImages.length
                    )
                  }
                  className="absolute right-2 rounded-full border border-white/15 bg-black/70 p-2 text-white transition-colors hover:bg-black/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label="Next image"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-end">
            {selectedImage && (
              <>
                <a
                  href={selectedImage.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-white/10"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open original
                </a>
                <a
                  href={selectedImage.url}
                  download
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </a>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

function VoiceButton({
  text,
  autoPlay,
  onAutoPlayStarted,
}: {
  text: string;
  autoPlay?: boolean;
  onAutoPlayStarted?: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);
  const hasAutoPlayed = useRef(false);

  const handlePlay = async () => {
    if (playing && audioRef.current) {
      stopActiveVoiceAudio();
      return;
    }
    stopActiveVoiceAudio();
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    activeVoiceRequestController = controller;
    setLoading(true);
    try {
      // Strip markdown AND tool status messages for cleaner speech
      const cleanText = text
        .replace(/```[\s\S]*?```/g, "code block omitted")
        .replace(/🛠️\s*Using tools autonomously\.\.\.?\n?/g, "")
        .replace(/🔍\s*Researching\.\.\.?\s*✅?\s*Done\s*/g, "")
        .replace(/🔧\s*\w+\.\.\.?\s*✅?\s*Done\s*/g, "")
        .replace(/✅\s*Tools used:.*$/gm, "")
        .replace(/🎨\s*Generating image:.*?\.\.\.\n?/g, "")
        .replace(/✅\s*Image generated successfully\.\n?/g, "")
        .replace(/\*\*Prompt used:\*\*.*$/gm, "")
        .replace(/\*\*Storage:\*\*.*$/gm, "")
        .replace(/\*\*Image:\*\*.*$/gm, "")
        .replace(/https?:\/\/[^\s]+/g, "")
        .replace(/\*\*/g, "")
        .replace(/[#*_~`]/g, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/\n{3,}/g, "\n")
        .trim()
        .slice(0, 4000);
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: cleanText, voice: "nova" }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("TTS failed");
      const blob = await res.blob();
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      activeVoiceAudio = audio;
      activeVoiceUrl = url;
      audio.onended = () => {
        if (activeVoiceAudio === audio) activeVoiceAudio = null;
        if (activeVoiceUrl === url) activeVoiceUrl = null;
        setPlaying(false);
        URL.revokeObjectURL(url);
      };
      await audio.play();
      setPlaying(true);
    } catch (e) {
      if ((e as Error).name !== "AbortError") console.error("[TTS]", e);
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
        setLoading(false);
      }
      if (activeVoiceRequestController === controller) {
        activeVoiceRequestController = null;
      }
    }
  };

  useEffect(() => {
    const markStopped = () => setPlaying(false);
    window.addEventListener("q:toriu-voice-stop", markStopped);
    return () => window.removeEventListener("q:toriu-voice-stop", markStopped);
  }, []);

  useEffect(() => {
    return () => {
      requestControllerRef.current?.abort();
      if (audioRef.current && activeVoiceAudio === audioRef.current) {
        stopActiveVoiceAudio();
      }
    };
  }, []);

  // Restored history stays silent. Only the response that just completed live
  // receives autoPlay=true from ConversationPanel.
  useEffect(() => {
    if (autoPlay && !hasAutoPlayed.current && text && text.length > 0) {
      hasAutoPlayed.current = true;
      const timer = setTimeout(() => {
        onAutoPlayStarted?.();
        void handlePlay();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [autoPlay, text, onAutoPlayStarted]);

  return (
    <div className="mt-2 pt-1.5 border-t border-white/5">
      <button
        onClick={handlePlay}
        disabled={loading}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-orange-500/10 border border-white/10 hover:border-orange-500/20 text-[11px] text-white/60 hover:text-orange-300 transition-all disabled:opacity-50"
      >
        {playing ? (
          <Square className="w-3 h-3" />
        ) : (
          <Volume2 className="w-3.5 h-3.5" />
        )}
        {loading ? "Generating..." : playing ? "Stop" : "Listen"}
      </button>
    </div>
  );
}

function langToExt(lang: string): string {
  const map: Record<string, string> = {
    javascript: "js",
    typescript: "ts",
    python: "py",
    html: "html",
    css: "css",
    json: "json",
    jsx: "jsx",
    tsx: "tsx",
    rust: "rs",
    go: "go",
    java: "java",
    ruby: "rb",
    php: "php",
    swift: "swift",
    kotlin: "kt",
    sql: "sql",
    bash: "sh",
    shell: "sh",
    yaml: "yml",
    markdown: "md",
  };
  return map[lang.toLowerCase()] || lang;
}

function FileIcon({ type }: { type: string }) {
  if (type.startsWith("image/"))
    return <Image size={10} className="text-blue-400" />;
  if (type.includes("pdf") || type.includes("document"))
    return <FileText size={10} className="text-orange-400" />;
  return <File size={10} className="text-muted-foreground" />;
}
