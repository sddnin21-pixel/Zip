import type { ProviderId } from "../models/types";

export type AgentTaskStatus = "planning" | "running" | "verifying" | "done" | "failed" | "cancelled";

export interface AgentPlanStep {
  id: string;
  description: string;
  /** Which skill (if any) this step is expected to invoke — null for pure reasoning/synthesis steps. */
  skillName?: string;
  status: "pending" | "running" | "done" | "failed" | "skipped";
  result?: unknown;
  error?: string;
}

export interface AgentTask {
  id: string;
  conversationId: string;
  goal: string;
  plan: AgentPlanStep[];
  status: AgentTaskStatus;
  stepCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface AgentLimits {
  maxSteps: number;
  maxToolCalls: number;
  timeoutMs: number;
  maxTokenBudget: number;
}

export const DEFAULT_AGENT_LIMITS: AgentLimits = {
  maxSteps: 15,
  maxToolCalls: 20,
  timeoutMs: 5 * 60 * 1000, // 5 minutes
  maxTokenBudget: 100_000,
};

export interface AgentEvent {
  type: "plan_created" | "step_started" | "tool_call" | "tool_result" | "step_done" | "step_failed" | "verifying" | "task_done" | "task_failed" | "limit_reached";
  taskId: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

export interface AgentRunTarget {
  providerId: ProviderId;
  modelId: string;
}
