/**
 * Multi-Step Task Chain Orchestrator
 * Breaks complex requests into sequential steps, executes them one at a time,
 * passes context forward, and reports progress.
 */
import { callCaptainPlan, callBuilder, callValidator, callResearch } from "./workers";
import { addOrchestrationEvent } from "./db";
import { logger, startTrace, endTrace, recordMetric } from "./observability";

export interface TaskStep {
  id: number;
  name: string;
  description: string;
  worker: "builder" | "validator" | "research" | "browser" | "artist" | "executor";
  status: "pending" | "running" | "completed" | "failed" | "retrying";
  result?: string;
  error?: string;
}

export interface TaskChainResult {
  success: boolean;
  steps: TaskStep[];
  finalOutput: string;
  totalDuration: number;
}

type ProgressCallback = (step: TaskStep, stepIndex: number, totalSteps: number) => void;

/**
 * Execute a multi-step task chain
 */
export async function executeTaskChain(
  task: string,
  projectDescription: string,
  userId: number,
  projectId: number | null,
  onProgress?: ProgressCallback
): Promise<TaskChainResult> {
  const startTime = Date.now();
  const chainSpan = startTrace("task_chain", { service: "orchestrator", worker: "captain", attributes: { task: task.slice(0, 100) } });
  logger.info(`[TaskChain] Starting multi-step chain`, { worker: "captain" });
  recordMetric("task_chains_started", 1, "counter");

  // Step 1: Captain plans the execution
  const plan = await callCaptainPlan(task, projectDescription);
  const steps: TaskStep[] = plan.phases.map((phase, i) => ({
    id: i + 1,
    name: phase.name,
    description: phase.description,
    worker: phase.worker as TaskStep["worker"],
    status: "pending" as const,
  }));

  // Log chain start
  if (projectId) {
    await addOrchestrationEvent({
      user_id: userId,
      project_id: projectId,
      event_type: "pipeline_start",
      agent_name: "Captain Q",
      summary: `Task chain started: ${steps.length} steps planned`,
      payload: { steps: steps.map(s => s.name) },
    }).catch(() => {});
  }

  let context = `Task: ${task}\nProject: ${projectDescription}\n`;
  const results: string[] = [];

  // Execute each step sequentially
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    step.status = "running";

    // Report progress
    if (onProgress) onProgress(step, i, steps.length);

    if (projectId) {
      await addOrchestrationEvent({
        user_id: userId,
        project_id: projectId,
        event_type: "agent_spawned",
        agent_name: getWorkerName(step.worker),
        summary: `Step ${i + 1}/${steps.length}: ${step.name} — ${step.description}`,
        payload: { stepId: step.id, worker: step.worker },
      }).catch(() => {});
    }

    try {
      const result = await executeStep(step, context);
      step.status = "completed";
      step.result = result;
      results.push(`## Step ${i + 1}: ${step.name}\n${result}`);
      // Pass context forward
      context += `\n\n--- Step ${i + 1} Result (${step.name}) ---\n${result.slice(0, 2000)}`;

      if (projectId) {
        await addOrchestrationEvent({
          user_id: userId,
          project_id: projectId,
          event_type: "agent_completed",
          agent_name: getWorkerName(step.worker),
          summary: `Step ${i + 1}/${steps.length} completed: ${step.name}`,
          payload: { stepId: step.id, resultLength: result.length },
        }).catch(() => {});
      }
    } catch (error: any) {
      // Retry once on failure
      step.status = "retrying";
      if (onProgress) onProgress(step, i, steps.length);

      try {
        const retryResult = await executeStep(step, context);
        step.status = "completed";
        step.result = retryResult;
        results.push(`## Step ${i + 1}: ${step.name} (retry)\n${retryResult}`);
        context += `\n\n--- Step ${i + 1} Result (${step.name}, retry) ---\n${retryResult.slice(0, 2000)}`;
      } catch (retryError: any) {
        step.status = "failed";
        step.error = retryError?.message || "Step failed after retry";
        results.push(`## Step ${i + 1}: ${step.name} — FAILED\n${step.error}`);

        if (projectId) {
          await addOrchestrationEvent({
            user_id: userId,
            project_id: projectId,
            event_type: "validation_failed",
            agent_name: getWorkerName(step.worker),
            summary: `Step ${i + 1} failed: ${step.error}`,
          }).catch(() => {});
        }
      }
    }

    if (onProgress) onProgress(step, i, steps.length);
  }

  // Final summary
  const finalOutput = results.join("\n\n");
  const totalDuration = Date.now() - startTime;

  if (projectId) {
    await addOrchestrationEvent({
      user_id: userId,
      project_id: projectId,
      event_type: "pipeline_complete",
      agent_name: "Captain Q",
      summary: `Task chain completed in ${Math.round(totalDuration / 1000)}s — ${steps.filter(s => s.status === "completed").length}/${steps.length} steps succeeded`,
    }).catch(() => {});
  }

  const success = steps.every(s => s.status === "completed");
  endTrace(chainSpan, success ? "completed" : "failed");
  recordMetric("task_chains_completed", 1, "counter", { success: String(success) });
  logger.info(`[TaskChain] Completed in ${totalDuration}ms, success=${success}`, { worker: "captain" });

  return {
    success,
    steps,
    finalOutput,
    totalDuration,
  };
}

/**
 * Execute a single step based on its worker type
 */
async function executeStep(step: TaskStep, context: string): Promise<string> {
  switch (step.worker) {
    case "builder":
      return callBuilder(step.description, context.slice(-3000));
    case "validator":
      return callValidator(context.slice(-4000), step.description);
    case "research":
      return callResearch(step.description);
    case "browser":
      // Browser tasks are handled by the browser worker
      const { executeBrowserTask } = await import("./browserWorker");
      const result = await executeBrowserTask(step.description);
      return result.success ? result.content : `Browser error: ${result.error}`;
    case "executor":
      // Code execution
      const { executeCode } = await import("./codeExecutor");
      // Extract code from description if present
      const codeMatch = step.description.match(/```(?:javascript|typescript|python)?\n([\s\S]*?)```/);
      if (codeMatch) {
        const execResult = await executeCode(codeMatch[1], "javascript");
        return execResult.success
          ? `Output:\n${execResult.stdout}`
          : `Error:\n${execResult.stderr}`;
      }
      return "No executable code found in step description";
    case "artist":
      // Image generation handled elsewhere
      return "Image generation step — delegated to Artist worker";
    default:
      return callBuilder(step.description, context.slice(-3000));
  }
}

function getWorkerName(worker: string): string {
  const names: Record<string, string> = {
    builder: "Builder (OpenAI GPT-4o)",
    validator: "Validator (Anthropic Claude)",
    research: "Research (Perplexity Sonar)",
    browser: "Browser (Playwright)",
    artist: "Artist (DALL-E 3)",
    executor: "Executor (Sandbox)",
  };
  return names[worker] || `Worker (${worker})`;
}
