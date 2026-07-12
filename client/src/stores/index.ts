/**
 * Q Workspace — Zustand Stores
 * Source: MBS Section 6.1
 * 
 * Store architecture:
 * - useAuthStore: User session, permissions
 * - useProjectStore: Active project, phase state
 * - useOrchestrationStore: Real-time builder events, execution feed
 * - useConversationStore: Message history, typing state, uploads
 * - useUIStore: Panel states, navigation, preferences
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

// ─── Types ──────────────────────────────────────────────────────────────────

export type UserRole = "owner" | "admin" | "member" | "viewer";
export type ProjectStatus = "active" | "paused" | "completed" | "archived";
export type PhaseStatus = "pending" | "active" | "completed" | "failed" | "blocked";
export type AgentType = "coordinator" | "executor";
export type AgentStatus = "spawning" | "active" | "completed" | "error" | "terminated";
export type OrchestrationMode = "interactive" | "passive";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatar?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  currentPhase: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrchestrationEvent {
  id: string;
  projectId: string;
  eventType: "phase_entered" | "agent_spawned" | "agent_completed" | "validation_passed" | "validation_failed" | "gate_triggered" | "deployment_started" | "deployment_completed";
  payload: Record<string, unknown>;
  timestamp: Date;
}

export interface Agent {
  id: string;
  projectId: string;
  type: AgentType;
  name: string;
  task: string;
  status: AgentStatus;
  progress: number;
  thought?: string;
  spawnedAt: Date;
  completedAt?: Date;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  reasoning?: string[];
  attachments?: FileAttachment[];
  isStreaming?: boolean;
  // Patent 2: Synthesis Verification
  verificationBadge?: {
    score: number;
    label: string;
    verified: boolean;
  } | null;
  // Patent 3: Heartbeat status
  heartbeatStatus?: "healthy" | "warning" | "interrupted";
}

export interface FileAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url?: string;
}

export interface PhaseState {
  id: number;
  name: string;
  status: PhaseStatus;
  progress: number;
}

// ─── Auth Store ─────────────────────────────────────────────────────────────

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: {
    id: "user-1",
    email: "architect@qworkspace.ai",
    name: "Architect",
    role: "owner",
  },
  isAuthenticated: true,
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  logout: () => set({ user: null, isAuthenticated: false }),
}));

// ─── Project Store ──────────────────────────────────────────────────────────

interface ProjectState {
  projects: Project[];
  activeProject: Project | null;
  phases: PhaseState[];
  setActiveProject: (project: Project | null) => void;
  addProject: (project: Project) => void;
  updatePhase: (phaseId: number, updates: Partial<PhaseState>) => void;
}

const defaultPhases: PhaseState[] = [
  { id: 1, name: "Setup", status: "completed", progress: 100 },
  { id: 2, name: "Triage", status: "completed", progress: 100 },
  { id: 3, name: "Codebase Discovery", status: "completed", progress: 100 },
  { id: 4, name: "Skill Discovery", status: "completed", progress: 100 },
  { id: 5, name: "Complexity Assessment", status: "completed", progress: 100 },
  { id: 6, name: "Brainstorming", status: "completed", progress: 100 },
  { id: 7, name: "Architecting Plan", status: "completed", progress: 100 },
  { id: 8, name: "Implementation", status: "active", progress: 68 },
  { id: 9, name: "Design Verification", status: "pending", progress: 0 },
  { id: 10, name: "Domain Compliance", status: "pending", progress: 0 },
  { id: 11, name: "Code Quality", status: "pending", progress: 0 },
  { id: 12, name: "Test Planning", status: "pending", progress: 0 },
  { id: 13, name: "Testing", status: "pending", progress: 0 },
  { id: 14, name: "Coverage Verification", status: "pending", progress: 0 },
  { id: 15, name: "Terminal Validation", status: "pending", progress: 0 },
  { id: 16, name: "Deployment", status: "pending", progress: 0 },
];

const defaultProjects: Project[] = [
  {
    id: "proj-1",
    name: "HVAC Landing Page",
    description: "Responsive landing page with lead capture and mobile optimization",
    status: "active",
    currentPhase: 8,
    createdAt: new Date(Date.now() - 3600000),
    updatedAt: new Date(),
  },
  {
    id: "proj-2",
    name: "Analytics Dashboard",
    description: "Real-time business metrics dashboard with chart visualizations",
    status: "paused",
    currentPhase: 6,
    createdAt: new Date(Date.now() - 86400000),
    updatedAt: new Date(Date.now() - 7200000),
  },
  {
    id: "proj-3",
    name: "E-commerce API",
    description: "RESTful API with Stripe integration and inventory management",
    status: "completed",
    currentPhase: 16,
    createdAt: new Date(Date.now() - 172800000),
    updatedAt: new Date(Date.now() - 86400000),
  },
];

export const useProjectStore = create<ProjectState>((set) => ({
  projects: defaultProjects,
  activeProject: defaultProjects[0],
  phases: defaultPhases,
  setActiveProject: (project) => set({ activeProject: project }),
  addProject: (project) => set((s) => ({ projects: [...s.projects, project] })),
  updatePhase: (phaseId, updates) =>
    set((s) => ({
      phases: s.phases.map((p) => (p.id === phaseId ? { ...p, ...updates } : p)),
    })),
}));

// ─── Orchestration Store ────────────────────────────────────────────────────

interface OrchestrationState {
  events: OrchestrationEvent[];
  agents: Agent[];
  mode: OrchestrationMode;
  systemLoad: number;
  uptime: number;
  addEvent: (event: OrchestrationEvent) => void;
  addAgent: (agent: Agent) => void;
  updateAgent: (id: string, updates: Partial<Agent>) => void;
  setMode: (mode: OrchestrationMode) => void;
  setSystemLoad: (load: number) => void;
  incrementUptime: () => void;
}

export const useOrchestrationStore = create<OrchestrationState>((set) => ({
  events: [],
  agents: [],
  mode: "interactive",
  systemLoad: 42,
  uptime: 0,
  addEvent: (event) =>
    set((s) => ({ events: [event, ...s.events].slice(0, 50) })),
  addAgent: (agent) => set((s) => ({ agents: [...s.agents, agent] })),
  updateAgent: (id, updates) =>
    set((s) => ({
      agents: s.agents.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    })),
  setMode: (mode) => set({ mode }),
  setSystemLoad: (load) => set({ systemLoad: load }),
  incrementUptime: () => set((s) => ({ uptime: s.uptime + 1 })),
}));

// ─── Conversation Store ─────────────────────────────────────────────────────

interface ConversationState {
  messages: Message[];
  isTyping: boolean;
  pendingUploads: FileAttachment[];
  activeConversationId: string | null;
  addMessage: (message: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  setTyping: (typing: boolean) => void;
  setMessages: (messages: Message[]) => void;
  setActiveConversationId: (id: string | null) => void;
  addUpload: (file: FileAttachment) => void;
  removeUpload: (id: string) => void;
  clearUploads: () => void;
}

export const useConversationStore = create<ConversationState>((set) => ({
  messages: [],
  isTyping: false,
  pendingUploads: [],
  activeConversationId: null,
  addMessage: (message) => set((s) => ({ messages: [...s.messages, message] })),
  updateMessage: (id, updates) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    })),
  setTyping: (typing) => set({ isTyping: typing }),
  setMessages: (messages) => set({ messages }),
  setActiveConversationId: (id) => set({ activeConversationId: id }),
  addUpload: (file) => set((s) => ({ pendingUploads: [...s.pendingUploads, file] })),
  removeUpload: (id) => set((s) => ({ pendingUploads: s.pendingUploads.filter((f) => f.id !== id) })),
  clearUploads: () => set({ pendingUploads: [] }),
}));

// ─── UI Store ───────────────────────────────────────────────────────────────

interface UIState {
  rightPanelOpen: boolean;
  leftPanelWidth: number;
  activeNav: string;
  previewPanelOpen: boolean;
  previewCode: string | null;
  previewFileName: string | null;
  memoryDrawerOpen: boolean;
  heartbeatActive: boolean;
  heartbeatProgress: number;
  lastMemorySaved: string | null; // For toast display
  toggleRightPanel: () => void;
  setLeftPanelWidth: (width: number) => void;
  setActiveNav: (nav: string) => void;
  togglePreviewPanel: () => void;
  setPreviewCode: (code: string | null, fileName?: string | null) => void;
  openPreview: (code: string, fileName?: string) => void;
  closePreview: () => void;
  toggleMemoryDrawer: () => void;
  setHeartbeatActive: (active: boolean) => void;
  setHeartbeatProgress: (progress: number) => void;
  showMemorySavedToast: (category: string) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      rightPanelOpen: true,
      leftPanelWidth: 42,
      activeNav: "/",
      previewPanelOpen: false,
      previewCode: null,
      previewFileName: null,
      memoryDrawerOpen: false,
      heartbeatActive: false,
      heartbeatProgress: 0,
      lastMemorySaved: null,
      toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
      setLeftPanelWidth: (width) => set({ leftPanelWidth: width }),
      setActiveNav: (nav) => set({ activeNav: nav }),
      togglePreviewPanel: () => set((s) => ({ previewPanelOpen: !s.previewPanelOpen })),
      setPreviewCode: (code, fileName) => set({ previewCode: code, previewFileName: fileName ?? null }),
      openPreview: (code, fileName) => set({ previewPanelOpen: true, previewCode: code, previewFileName: fileName ?? "preview.html" }),
      closePreview: () => set({ previewPanelOpen: false, previewCode: null, previewFileName: null }),
      toggleMemoryDrawer: () => set((s) => ({ memoryDrawerOpen: !s.memoryDrawerOpen })),
      setHeartbeatActive: (active) => set({ heartbeatActive: active }),
      setHeartbeatProgress: (progress) => set({ heartbeatProgress: progress }),
      showMemorySavedToast: (category) => set({ lastMemorySaved: category }),
    }),
    { name: "q-workspace-ui", partialize: (state) => ({ rightPanelOpen: state.rightPanelOpen, leftPanelWidth: state.leftPanelWidth, activeNav: state.activeNav, previewPanelOpen: state.previewPanelOpen }) }
  )
);
