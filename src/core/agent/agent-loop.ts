import * as Crypto from "expo-crypto";
import type { Conversation } from "../conversation/conversation-types";
import { textMessage, type QusinMessage, type ToolCallPart } from "../conversation/message-types";
import { modelRouter } from "../router/model-router";
import { skillRegistry } from "../tools/skill-registry";
import { agentTaskStore } from "./agent-task-store";
import { verifyGeneratedFile, verifyToolOutput } from "./agent-verifier";
import type { AgentEvent, AgentLimits, AgentPlanStep, AgentRunTarget, AgentTask } from "./agent-types";
import { DEFAULT_AGENT_LIMITS } from "./agent-types";

export interface AgentRunOptions {
  conversation: Conversation;
  goal: string;
  target: AgentRunTarget;
  limits?: Partial<AgentLimits>;
  /** Called for a step whose skill requires confirmation (EXECUTE/WRITE/SYSTEM permission) before it runs. Return true to proceed. */
  onConfirmationNeeded?: (step: AgentPlanStep, toolName: string, args: unknown) => Promise<boolean>;
}

/**
 * Implements the loop from brief section 43: understand -> plan -> select
 * tools -> execute -> observe -> verify -> continue or finish. Uses the
 * target model's real tool-calling capability (via ChatRequest.tools) —
 * the "plan" is literally driven by what the model chooses to call, turn
 * by turn, rather than a separate fake planning stage that then gets
 * ignored. Enforces maxSteps/maxToolCalls/timeout/token budget so it can
 * never loop forever (section 43's explicit requirement).
 */
class AgentLoop {
  async *run(opts: AgentRunOptions): AsyncGenerator<AgentEvent, AgentTask, unknown> {
    const limits: AgentLimits = { ...DEFAULT_AGENT_LIMITS, ...opts.limits };
    const startedAt = Date.now();

    const task: AgentTask = {
      id: Crypto.randomUUID(),
      conversationId: opts.conversation.id,
      goal: opts.goal,
      plan: [],
      status: "planning",
      stepCount: 0,
      createdAt: startedAt,
      updatedAt: startedAt,
    };
    await agentTaskStore.create(task);
    yield { type: "plan_created", taskId: task.id, timestamp: Date.now(), data: { goal: opts.goal } };

    task.status = "running";
    const messages: QusinMessage[] = [
      textMessage(
        "system",
        "You are an agent inside Qusin AI. Use the available tools to accomplish the user's goal. " +
          "Call a tool for anything requiring real data or file output — never claim a step happened without calling its tool. " +
          "When you have fully accomplished the goal, respond with plain text and no further tool calls."
      ),
      textMessage("user", opts.goal),
    ];

    let toolCallCount = 0;
    let approxTokensUsed = 0;

    while (task.stepCount < limits.maxSteps) {
      if (Date.now() - startedAt > limits.timeoutMs) {
        yield { type: "limit_reached", taskId: task.id, timestamp: Date.now(), data: { limit: "timeoutMs" } };
        task.status = "failed";
        await this.finish(task);
        return task;
      }
      if (toolCallCount >= limits.maxToolCalls) {
        yield { type: "limit_reached", taskId: task.id, timestamp: Date.now(), data: { limit: "maxToolCalls" } };
        task.status = "failed";
        await this.finish(task);
        return task;
      }
      if (approxTokensUsed >= limits.maxTokenBudget) {
        yield { type: "limit_reached", taskId: task.id, timestamp: Date.now(), data: { limit: "maxTokenBudget" } };
        task.status = "failed";
        await this.finish(task);
        return task;
      }

      task.stepCount++;
      const stepId = Crypto.randomUUID();
      const step: AgentPlanStep = { id: stepId, description: "", status: "running" };
      task.plan.push(step);
      yield { type: "step_started", taskId: task.id, timestamp: Date.now(), data: { stepId } };

      const { response } = await modelRouter.chat({
        primary: { providerId: opts.target.providerId, modelId: opts.target.modelId },
        request: {
          messages,
          tools: skillRegistry.toToolDefinitions(),
          toolChoice: "auto",
        },
      });

      approxTokensUsed += response.message.usage?.totalTokens ?? 500;
      messages.push(response.message);

      const toolCalls = response.message.parts.filter((p): p is ToolCallPart => p.type === "tool_call");

      if (toolCalls.length === 0) {
        // No tool call means the model considers the goal done (or is
        // asking a clarifying question) — either way, the loop ends here.
        step.status = "done";
        step.description = "Final response";
        step.result = response.message.parts.find((p) => p.type === "text");
        task.status = "verifying";
        yield { type: "step_done", taskId: task.id, timestamp: Date.now(), data: { stepId } };
        yield { type: "verifying", taskId: task.id, timestamp: Date.now() };
        task.status = "done";
        await this.finish(task);
        yield { type: "task_done", taskId: task.id, timestamp: Date.now() };
        return task;
      }

      for (const call of toolCalls) {
        if (toolCallCount >= limits.maxToolCalls) break;
        toolCallCount++;
        step.description = `Call ${call.name}`;
        step.skillName = call.name;
        yield { type: "tool_call", taskId: task.id, timestamp: Date.now(), data: { name: call.name, arguments: call.arguments } };

        const needsConfirmation = skillRegistry.requiresConfirmation(call.name);
        let confirmed = !needsConfirmation;
        if (needsConfirmation && opts.onConfirmationNeeded) {
          confirmed = await opts.onConfirmationNeeded(step, call.name, call.arguments);
        }

        const startedToolAt = Date.now();
        const execResult = await skillRegistry.execute(call.name, call.arguments, { confirmed });

        if (execResult.requiresConfirmation && !execResult.confirmed) {
          step.status = "skipped";
          step.error = "Skipped — user did not confirm this action.";
          messages.push({
            id: Crypto.randomUUID(),
            role: "tool",
            parts: [{ type: "tool_result", toolCallId: call.id, name: call.name, result: { skipped: true, reason: "User did not confirm." }, isError: true }],
            timestamp: Date.now(),
          });
          continue;
        }

        // Post-execution verification (brief section 44). For anything
        // that returned a localUri, independently re-check the file on
        // disk rather than trusting the skill's own internal validation
        // alone.
        let verification: { ok: boolean; reason?: string } = { ok: true };
        const output = execResult.output as Record<string, unknown> | undefined;
        if (output && typeof output === "object" && "localUri" in output && typeof output.localUri === "string") {
          const ext = output.localUri.split(".").pop();
          verification = await verifyGeneratedFile(output.localUri, ext);
        } else if (output) {
          verification = verifyToolOutput(output, []);
        }

        await agentTaskStore.recordToolCall({
          taskId: task.id,
          conversationId: opts.conversation.id,
          toolName: call.name,
          argumentsJson: JSON.stringify(call.arguments),
          resultJson: JSON.stringify(execResult.output ?? execResult.error ?? null),
          isError: !!execResult.error || !verification.ok,
          permissionLevel: skillRegistry.get(call.name)?.permissions.join(",") ?? "READ",
          confirmedByUser: confirmed,
          startedAt: startedToolAt,
          completedAt: Date.now(),
        });

        const toolResultPayload = execResult.error
          ? { error: execResult.error }
          : verification.ok
            ? execResult.output
            : { error: `Verification failed: ${verification.reason}`, raw: execResult.output };

        yield {
          type: "tool_result",
          taskId: task.id,
          timestamp: Date.now(),
          data: { name: call.name, result: toolResultPayload, verified: verification.ok },
        };

        messages.push({
          id: Crypto.randomUUID(),
          role: "tool",
          parts: [{ type: "tool_result", toolCallId: call.id, name: call.name, result: toolResultPayload, isError: !!execResult.error || !verification.ok }],
          timestamp: Date.now(),
        });

        if (execResult.error || !verification.ok) {
          step.status = "failed";
          step.error = execResult.error ?? verification.reason;
        }
      }

      if (step.status === "running") step.status = "done";
      yield { type: "step_done", taskId: task.id, timestamp: Date.now(), data: { stepId } };
      await agentTaskStore.update({ ...task, updatedAt: Date.now() });
    }

    yield { type: "limit_reached", taskId: task.id, timestamp: Date.now(), data: { limit: "maxSteps" } };
    task.status = "failed";
    await this.finish(task);
    yield { type: "task_failed", taskId: task.id, timestamp: Date.now() };
    return task;
  }

  private async finish(task: AgentTask): Promise<void> {
    task.updatedAt = Date.now();
    await agentTaskStore.update(task);
  }
}

export const agentLoop = new AgentLoop();
