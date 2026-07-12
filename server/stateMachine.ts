/**
 * Q Workspace — Agent State Machine
 * 
 * Formal workflow engine with deterministic state transitions.
 * Implements: planner → executor → validator → repair loop → completion
 * 
 * Features:
 * - Formal lifecycle states (idle, planning, executing, validating, repairing, completed, failed)
 * - Deterministic state transitions with guards
 * - Supervisor checkpoints for failure recovery
 * - Retry logic with state persistence
 * - Repair loop (max 3 iterations before failure)
 */

// ─── State Definitions ───────────────────────────────────────────────────────

export type AgentState =
  | "idle"
  | "planning"
  | "executing"
  | "validating"
  | "repairing"
  | "completed"
  | "failed"
  | "paused"
  | "cancelled";

export type AgentEvent =
  | "START"
  | "PLAN_COMPLETE"
  | "PLAN_FAILED"
  | "EXECUTE_COMPLETE"
  | "EXECUTE_FAILED"
  | "VALIDATE_PASS"
  | "VALIDATE_FAIL"
  | "REPAIR_COMPLETE"
  | "REPAIR_FAILED"
  | "MAX_REPAIRS_REACHED"
  | "PAUSE"
  | "RESUME"
  | "CANCEL"
  | "RETRY"
  | "RESET";

// ─── State Transition Table ──────────────────────────────────────────────────

const TRANSITIONS: Record<AgentState, Partial<Record<AgentEvent, AgentState>>> = {
  idle: {
    START: "planning",
    CANCEL: "cancelled",
  },
  planning: {
    PLAN_COMPLETE: "executing",
    PLAN_FAILED: "failed",
    PAUSE: "paused",
    CANCEL: "cancelled",
  },
  executing: {
    EXECUTE_COMPLETE: "validating",
    EXECUTE_FAILED: "failed",
    PAUSE: "paused",
    CANCEL: "cancelled",
  },
  validating: {
    VALIDATE_PASS: "completed",
    VALIDATE_FAIL: "repairing",
    PAUSE: "paused",
    CANCEL: "cancelled",
  },
  repairing: {
    REPAIR_COMPLETE: "validating",
    REPAIR_FAILED: "failed",
    MAX_REPAIRS_REACHED: "failed",
    PAUSE: "paused",
    CANCEL: "cancelled",
  },
  completed: {
    RESET: "idle",
  },
  failed: {
    RETRY: "planning",
    RESET: "idle",
  },
  paused: {
    RESUME: "executing", // Will be overridden by checkpoint's previousState
    CANCEL: "cancelled",
  },
  cancelled: {
    RESET: "idle",
  },
};

// ─── Checkpoint (Supervisor Snapshot) ────────────────────────────────────────

export interface SupervisorCheckpoint {
  id: string;
  taskId: string;
  state: AgentState;
  previousState: AgentState;
  plan: TaskPlan | null;
  executionResults: ExecutionResult[];
  validationResults: ValidationResult[];
  repairAttempts: number;
  retryCount: number;
  context: Record<string, any>;
  createdAt: number;
}

// ─── Task Plan ───────────────────────────────────────────────────────────────

export interface TaskStep {
  id: string;
  name: string;
  worker: string;
  input: string;
  dependencies: string[];
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  output?: string;
  error?: string;
}

export interface TaskPlan {
  taskId: string;
  objective: string;
  steps: TaskStep[];
  estimatedComplexity: "low" | "medium" | "high";
  createdAt: number;
}

// ─── Execution & Validation Results ──────────────────────────────────────────

export interface ExecutionResult {
  stepId: string;
  worker: string;
  output: string;
  tokensUsed: number;
  durationMs: number;
  success: boolean;
  error?: string;
}

export interface ValidationResult {
  stepId: string;
  passed: boolean;
  issues: ValidationIssue[];
  score: number; // 0-100
  suggestions: string[];
}

export interface ValidationIssue {
  severity: "critical" | "warning" | "info";
  message: string;
  location?: string;
}

// ─── State Machine Instance ──────────────────────────────────────────────────

export interface StateMachineConfig {
  maxRepairAttempts: number;
  maxRetries: number;
  checkpointInterval: number; // ms between auto-checkpoints
  timeoutMs: number;
  onStateChange?: (from: AgentState, to: AgentState, event: AgentEvent) => void;
  onCheckpoint?: (checkpoint: SupervisorCheckpoint) => void;
  onComplete?: (results: ExecutionResult[]) => void;
  onFail?: (error: string, checkpoint: SupervisorCheckpoint) => void;
}

const DEFAULT_CONFIG: StateMachineConfig = {
  maxRepairAttempts: 3,
  maxRetries: 2,
  checkpointInterval: 30000,
  timeoutMs: 120000,
};

export class AgentStateMachine {
  private state: AgentState = "idle";
  private taskId: string;
  private config: StateMachineConfig;
  private plan: TaskPlan | null = null;
  private executionResults: ExecutionResult[] = [];
  private validationResults: ValidationResult[] = [];
  private repairAttempts: number = 0;
  private retryCount: number = 0;
  private checkpoints: SupervisorCheckpoint[] = [];
  private previousState: AgentState = "idle";
  private context: Record<string, any> = {};
  private startedAt: number = 0;
  private stateHistory: Array<{ state: AgentState; event: AgentEvent; timestamp: number }> = [];

  constructor(taskId: string, config?: Partial<StateMachineConfig>) {
    this.taskId = taskId;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  getState(): AgentState {
    return this.state;
  }

  getTaskId(): string {
    return this.taskId;
  }

  getPlan(): TaskPlan | null {
    return this.plan;
  }

  getResults(): ExecutionResult[] {
    return [...this.executionResults];
  }

  getValidationResults(): ValidationResult[] {
    return [...this.validationResults];
  }

  getCheckpoints(): SupervisorCheckpoint[] {
    return [...this.checkpoints];
  }

  getStateHistory() {
    return [...this.stateHistory];
  }

  getStatus() {
    return {
      taskId: this.taskId,
      state: this.state,
      plan: this.plan,
      executionResults: this.executionResults,
      validationResults: this.validationResults,
      repairAttempts: this.repairAttempts,
      retryCount: this.retryCount,
      checkpointCount: this.checkpoints.length,
      elapsedMs: this.startedAt ? Date.now() - this.startedAt : 0,
      stateHistory: this.stateHistory,
    };
  }

  // ─── State Transitions ───────────────────────────────────────────────────

  dispatch(event: AgentEvent): { success: boolean; newState: AgentState; error?: string } {
    const allowedTransitions = TRANSITIONS[this.state];
    const nextState = allowedTransitions?.[event];

    if (!nextState) {
      return {
        success: false,
        newState: this.state,
        error: `Invalid transition: cannot dispatch '${event}' from state '${this.state}'`,
      };
    }

    // Special handling for RESUME — go back to the state before pause
    let resolvedNextState = nextState;
    if (event === "RESUME" && this.state === "paused") {
      resolvedNextState = this.previousState !== "paused" ? this.previousState : "executing";
    }

    this.previousState = this.state;
    this.state = resolvedNextState;

    this.stateHistory.push({ state: resolvedNextState, event, timestamp: Date.now() });
    this.config.onStateChange?.(this.previousState, resolvedNextState, event);

    // Auto-checkpoint on significant transitions
    if (["executing", "validating", "repairing", "completed", "failed"].includes(resolvedNextState)) {
      this.createCheckpoint();
    }

    return { success: true, newState: resolvedNextState };
  }

  // ─── Workflow Execution ──────────────────────────────────────────────────

  async start(objective: string): Promise<void> {
    this.startedAt = Date.now();
    this.context.objective = objective;
    this.dispatch("START");
  }

  setPlan(plan: TaskPlan): { success: boolean; error?: string } {
    if (this.state !== "planning") {
      return { success: false, error: `Cannot set plan in state '${this.state}', must be in 'planning'` };
    }
    this.plan = plan;
    return this.dispatch("PLAN_COMPLETE");
  }

  failPlanning(error: string): { success: boolean } {
    this.context.planError = error;
    return this.dispatch("PLAN_FAILED");
  }

  addExecutionResult(result: ExecutionResult): void {
    this.executionResults.push(result);
    
    // Update plan step status
    if (this.plan) {
      const step = this.plan.steps.find(s => s.id === result.stepId);
      if (step) {
        step.status = result.success ? "completed" : "failed";
        step.output = result.output;
        step.error = result.error;
      }
    }
  }

  completeExecution(): { success: boolean; error?: string } {
    if (this.state !== "executing") {
      return { success: false, error: `Cannot complete execution in state '${this.state}'` };
    }
    return this.dispatch("EXECUTE_COMPLETE");
  }

  failExecution(error: string): { success: boolean } {
    this.context.executionError = error;
    return this.dispatch("EXECUTE_FAILED");
  }

  passValidation(results: ValidationResult[]): { success: boolean; error?: string } {
    if (this.state !== "validating") {
      return { success: false, error: `Cannot pass validation in state '${this.state}'` };
    }
    this.validationResults.push(...results);
    const result = this.dispatch("VALIDATE_PASS");
    if (result.success) {
      this.config.onComplete?.(this.executionResults);
    }
    return result;
  }

  failValidation(results: ValidationResult[]): { success: boolean; error?: string } {
    if (this.state !== "validating") {
      return { success: false, error: `Cannot fail validation in state '${this.state}'` };
    }
    this.validationResults.push(...results);

    // Check if max repairs reached
    if (this.repairAttempts >= this.config.maxRepairAttempts) {
      const result = this.dispatch("MAX_REPAIRS_REACHED");
      if (result.success) {
        this.config.onFail?.(`Max repair attempts (${this.config.maxRepairAttempts}) reached`, this.getLatestCheckpoint()!);
      }
      return result;
    }

    return this.dispatch("VALIDATE_FAIL");
  }

  completeRepair(fixedResults: ExecutionResult[]): { success: boolean; error?: string } {
    if (this.state !== "repairing") {
      return { success: false, error: `Cannot complete repair in state '${this.state}'` };
    }
    this.repairAttempts++;
    this.executionResults.push(...fixedResults);
    
    // Update plan steps
    if (this.plan) {
      for (const result of fixedResults) {
        const step = this.plan.steps.find(s => s.id === result.stepId);
        if (step) {
          step.status = result.success ? "completed" : "failed";
          step.output = result.output;
        }
      }
    }

    return this.dispatch("REPAIR_COMPLETE");
  }

  failRepair(error: string): { success: boolean } {
    this.context.repairError = error;
    return this.dispatch("REPAIR_FAILED");
  }

  pause(): { success: boolean } {
    return this.dispatch("PAUSE");
  }

  resume(): { success: boolean } {
    return this.dispatch("RESUME");
  }

  cancel(): { success: boolean } {
    return this.dispatch("CANCEL");
  }

  retry(): { success: boolean; error?: string } {
    if (this.retryCount >= this.config.maxRetries) {
      return { success: false, error: `Max retries (${this.config.maxRetries}) reached` };
    }
    this.retryCount++;
    this.repairAttempts = 0;
    this.executionResults = [];
    this.validationResults = [];
    return this.dispatch("RETRY");
  }

  reset(): { success: boolean } {
    this.plan = null;
    this.executionResults = [];
    this.validationResults = [];
    this.repairAttempts = 0;
    this.retryCount = 0;
    this.context = {};
    this.startedAt = 0;
    return this.dispatch("RESET");
  }

  // ─── Supervisor Checkpoints ──────────────────────────────────────────────

  createCheckpoint(): SupervisorCheckpoint {
    const checkpoint: SupervisorCheckpoint = {
      id: `cp_${this.taskId}_${Date.now()}`,
      taskId: this.taskId,
      state: this.state,
      previousState: this.previousState,
      plan: this.plan ? { ...this.plan, steps: this.plan.steps.map(s => ({ ...s })) } : null,
      executionResults: [...this.executionResults],
      validationResults: [...this.validationResults],
      repairAttempts: this.repairAttempts,
      retryCount: this.retryCount,
      context: { ...this.context },
      createdAt: Date.now(),
    };

    this.checkpoints.push(checkpoint);
    this.config.onCheckpoint?.(checkpoint);
    return checkpoint;
  }

  restoreFromCheckpoint(checkpoint: SupervisorCheckpoint): void {
    this.state = checkpoint.state;
    this.previousState = checkpoint.previousState;
    this.plan = checkpoint.plan;
    this.executionResults = [...checkpoint.executionResults];
    this.validationResults = [...checkpoint.validationResults];
    this.repairAttempts = checkpoint.repairAttempts;
    this.retryCount = checkpoint.retryCount;
    this.context = { ...checkpoint.context };
  }

  getLatestCheckpoint(): SupervisorCheckpoint | null {
    return this.checkpoints.length > 0 ? this.checkpoints[this.checkpoints.length - 1] : null;
  }

  // ─── Timeout Check ─────────────────────────────────────────────────────

  isTimedOut(): boolean {
    if (!this.startedAt) return false;
    return Date.now() - this.startedAt > this.config.timeoutMs;
  }
}

// ─── Active State Machines Registry ──────────────────────────────────────────

const activeMachines: Map<string, AgentStateMachine> = new Map();

export function createStateMachine(taskId: string, config?: Partial<StateMachineConfig>): AgentStateMachine {
  const machine = new AgentStateMachine(taskId, config);
  activeMachines.set(taskId, machine);
  return machine;
}

export function getStateMachine(taskId: string): AgentStateMachine | undefined {
  return activeMachines.get(taskId);
}

export function removeStateMachine(taskId: string): void {
  activeMachines.delete(taskId);
}

export function getAllStateMachines(): Array<{ taskId: string; state: AgentState; elapsed: number }> {
  const result: Array<{ taskId: string; state: AgentState; elapsed: number }> = [];
  Array.from(activeMachines.entries()).forEach(([taskId, machine]) => {
    result.push({
      taskId,
      state: machine.getState(),
      elapsed: machine.getStatus().elapsedMs,
    });
  });
  return result;
}

export function cleanupCompletedMachines(): number {
  let cleaned = 0;
  const toDelete: string[] = [];
  Array.from(activeMachines.entries()).forEach(([taskId, machine]) => {
    const state = machine.getState();
    if (state === "completed" || state === "cancelled" || state === "failed") {
      const elapsed = machine.getStatus().elapsedMs;
      // Clean up machines that have been in terminal state for > 5 minutes
      if (elapsed > 300_000) {
        toDelete.push(taskId);
        cleaned++;
      }
    }
  });
  toDelete.forEach(id => activeMachines.delete(id));
  return cleaned;
}

// ─── Orchestrated Workflow Runner ────────────────────────────────────────────

export interface WorkflowHandlers {
  plan: (objective: string) => Promise<TaskPlan>;
  execute: (plan: TaskPlan) => Promise<ExecutionResult[]>;
  validate: (results: ExecutionResult[], plan: TaskPlan) => Promise<ValidationResult[]>;
  repair: (issues: ValidationIssue[], results: ExecutionResult[], plan: TaskPlan) => Promise<ExecutionResult[]>;
}

/**
 * Run a full planner → executor → validator → repair loop workflow.
 * Returns the final state machine status.
 */
export async function runWorkflow(
  taskId: string,
  objective: string,
  handlers: WorkflowHandlers,
  config?: Partial<StateMachineConfig>,
  onProgress?: (state: AgentState, detail: string) => void
): Promise<ReturnType<AgentStateMachine["getStatus"]>> {
  const machine = createStateMachine(taskId, config);

  try {
    // Start
    await machine.start(objective);
    onProgress?.("planning", "Analyzing task and creating execution plan...");

    // Plan
    const plan = await handlers.plan(objective);
    machine.setPlan(plan);
    onProgress?.("executing", `Executing ${plan.steps.length} steps...`);

    // Execute
    const results = await handlers.execute(plan);
    for (const result of results) {
      machine.addExecutionResult(result);
    }
    machine.completeExecution();
    onProgress?.("validating", "Validating results...");

    // Validate → Repair Loop
    let validationResults = await handlers.validate(results, plan);
    const allPassed = validationResults.every(v => v.passed);

    if (allPassed) {
      machine.passValidation(validationResults);
      onProgress?.("completed", "All validations passed. Task complete.");
    } else {
      machine.failValidation(validationResults);

      // Repair loop
      while (machine.getState() === "repairing") {
        onProgress?.("repairing", `Repair attempt ${machine.getStatus().repairAttempts + 1}...`);

        const allIssues = validationResults.flatMap(v => v.issues);
        const fixedResults = await handlers.repair(allIssues, results, plan);
        machine.completeRepair(fixedResults);

        // Re-validate
        onProgress?.("validating", "Re-validating after repair...");
        validationResults = await handlers.validate(fixedResults, plan);
        const nowPassed = validationResults.every(v => v.passed);

        if (nowPassed) {
          machine.passValidation(validationResults);
          onProgress?.("completed", "Repairs successful. Task complete.");
        } else {
          machine.failValidation(validationResults);
        }
      }
    }
  } catch (error: any) {
    const state = machine.getState();
    if (state === "planning") {
      machine.failPlanning(error.message);
    } else if (state === "executing") {
      machine.failExecution(error.message);
    } else if (state === "repairing") {
      machine.failRepair(error.message);
    }
    onProgress?.("failed", `Error: ${error.message}`);
  }

  const status = machine.getStatus();

  // Clean up after a delay
  setTimeout(() => removeStateMachine(taskId), 300_000);

  return status;
}
