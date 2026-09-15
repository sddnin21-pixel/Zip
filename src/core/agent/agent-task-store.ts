import { getDb } from "../../storage/db";
import type { AgentTask } from "./agent-types";
import * as Crypto from "expo-crypto";

export interface ToolCallRecord {
  id: string;
  taskId?: string;
  conversationId: string;
  toolName: string;
  argumentsJson: string;
  resultJson?: string;
  isError: boolean;
  permissionLevel: string;
  confirmedByUser: boolean;
  startedAt: number;
  completedAt?: number;
}

class AgentTaskStore {
  async create(task: AgentTask): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO agent_tasks (id, conversation_id, goal, plan_json, status, step_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [task.id, task.conversationId, task.goal, JSON.stringify(task.plan), task.status, task.stepCount, task.createdAt, task.updatedAt]
    );
  }

  async update(task: AgentTask): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `UPDATE agent_tasks SET plan_json = ?, status = ?, step_count = ?, updated_at = ? WHERE id = ?`,
      [JSON.stringify(task.plan), task.status, task.stepCount, task.updatedAt, task.id]
    );
  }

  async get(id: string): Promise<AgentTask | undefined> {
    const db = await getDb();
    const row = await db.getFirstAsync<Record<string, unknown>>(`SELECT * FROM agent_tasks WHERE id = ?`, [id]);
    return row ? rowToTask(row) : undefined;
  }

  async listForConversation(conversationId: string): Promise<AgentTask[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM agent_tasks WHERE conversation_id = ? ORDER BY created_at DESC`,
      [conversationId]
    );
    return rows.map(rowToTask);
  }

  async recordToolCall(record: Omit<ToolCallRecord, "id">): Promise<string> {
    const id = Crypto.randomUUID();
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO tool_calls (id, task_id, conversation_id, tool_name, arguments_json, result_json, is_error, permission_level, confirmed_by_user, started_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        record.taskId ?? null,
        record.conversationId,
        record.toolName,
        record.argumentsJson,
        record.resultJson ?? null,
        record.isError ? 1 : 0,
        record.permissionLevel,
        record.confirmedByUser ? 1 : 0,
        record.startedAt,
        record.completedAt ?? null,
      ]
    );
    return id;
  }

  async listToolCalls(conversationId: string): Promise<ToolCallRecord[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM tool_calls WHERE conversation_id = ? ORDER BY started_at ASC`,
      [conversationId]
    );
    return rows.map(rowToToolCall);
  }
}

function rowToTask(row: Record<string, unknown>): AgentTask {
  return {
    id: row.id as string,
    conversationId: row.conversation_id as string,
    goal: row.goal as string,
    plan: JSON.parse((row.plan_json as string) ?? "[]"),
    status: row.status as AgentTask["status"],
    stepCount: row.step_count as number,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

function rowToToolCall(row: Record<string, unknown>): ToolCallRecord {
  return {
    id: row.id as string,
    taskId: (row.task_id as string) ?? undefined,
    conversationId: row.conversation_id as string,
    toolName: row.tool_name as string,
    argumentsJson: row.arguments_json as string,
    resultJson: (row.result_json as string) ?? undefined,
    isError: row.is_error === 1,
    permissionLevel: row.permission_level as string,
    confirmedByUser: row.confirmed_by_user === 1,
    startedAt: row.started_at as number,
    completedAt: (row.completed_at as number) ?? undefined,
  };
}

export const agentTaskStore = new AgentTaskStore();
