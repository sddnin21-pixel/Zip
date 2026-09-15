import { getDb } from "../../storage/db";
import type { Conversation, ConversationSettings, ModelSwitchEvent } from "./conversation-types";
import type { QusinMessage } from "./message-types";

class ConversationStore {
  async create(conversation: Conversation): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO conversations (id, project_id, title, created_at, updated_at, pinned, archived, settings_json, summary, summary_up_to_index)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        conversation.id,
        conversation.projectId ?? null,
        conversation.title,
        conversation.createdAt,
        conversation.updatedAt,
        conversation.pinned ? 1 : 0,
        conversation.archived ? 1 : 0,
        JSON.stringify(conversation.settings),
        conversation.summary ?? null,
        conversation.summaryUpToMessageIndex ?? null,
      ]
    );
  }

  async appendMessage(conversationId: string, message: QusinMessage, seq: number): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO messages (id, conversation_id, seq, role, parts_json, provider, model, finish_reason, usage_json, metadata_json, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        message.id,
        conversationId,
        seq,
        message.role,
        JSON.stringify(message.parts),
        message.provider ?? null,
        message.model ?? null,
        message.finishReason ?? null,
        message.usage ? JSON.stringify(message.usage) : null,
        message.metadata ? JSON.stringify(message.metadata) : null,
        message.timestamp,
      ]
    );
    await db.runAsync(`UPDATE conversations SET updated_at = ? WHERE id = ?`, [Date.now(), conversationId]);
  }

  async recordModelSwitch(conversationId: string, event: ModelSwitchEvent): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO model_switch_events (id, conversation_id, from_provider, from_model, to_provider, to_model, at_message_index, reason, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.id,
        conversationId,
        event.fromProvider ?? null,
        event.fromModel ?? null,
        event.toProvider,
        event.toModel,
        event.atMessageIndex,
        event.reason,
        event.timestamp,
      ]
    );
  }

  async updateSettings(conversationId: string, settings: ConversationSettings): Promise<void> {
    const db = await getDb();
    await db.runAsync(`UPDATE conversations SET settings_json = ?, updated_at = ? WHERE id = ?`, [
      JSON.stringify(settings),
      Date.now(),
      conversationId,
    ]);
  }

  async updateSummary(conversationId: string, summary: string, upToIndex: number): Promise<void> {
    const db = await getDb();
    await db.runAsync(`UPDATE conversations SET summary = ?, summary_up_to_index = ? WHERE id = ?`, [
      summary,
      upToIndex,
      conversationId,
    ]);
  }

  async rename(conversationId: string, title: string): Promise<void> {
    const db = await getDb();
    await db.runAsync(`UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?`, [
      title,
      Date.now(),
      conversationId,
    ]);
  }

  async setPinned(conversationId: string, pinned: boolean): Promise<void> {
    const db = await getDb();
    await db.runAsync(`UPDATE conversations SET pinned = ? WHERE id = ?`, [pinned ? 1 : 0, conversationId]);
  }

  async setArchived(conversationId: string, archived: boolean): Promise<void> {
    const db = await getDb();
    await db.runAsync(`UPDATE conversations SET archived = ? WHERE id = ?`, [archived ? 1 : 0, conversationId]);
  }

  async delete(conversationId: string): Promise<void> {
    const db = await getDb();
    await db.runAsync(`DELETE FROM conversations WHERE id = ?`, [conversationId]); // cascades via FK
  }

  async get(conversationId: string): Promise<Conversation | null> {
    const db = await getDb();
    const row = await db.getFirstAsync<Record<string, unknown>>(`SELECT * FROM conversations WHERE id = ?`, [
      conversationId,
    ]);
    if (!row) return null;

    const messageRows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM messages WHERE conversation_id = ? ORDER BY seq ASC`,
      [conversationId]
    );
    const switchRows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM model_switch_events WHERE conversation_id = ? ORDER BY timestamp ASC`,
      [conversationId]
    );

    return rowToConversation(row, messageRows, switchRows);
  }

  async list(opts?: { projectId?: string; archived?: boolean; searchQuery?: string }): Promise<Conversation[]> {
    const db = await getDb();
    const clauses: string[] = [];
    const args: (string | number)[] = [];
    if (opts?.projectId) {
      clauses.push("project_id = ?");
      args.push(opts.projectId);
    }
    if (opts?.archived !== undefined) {
      clauses.push("archived = ?");
      args.push(opts.archived ? 1 : 0);
    }
    if (opts?.searchQuery) {
      clauses.push("title LIKE ?");
      args.push(`%${opts.searchQuery}%`);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM conversations ${where} ORDER BY pinned DESC, updated_at DESC`,
      args
    );
    // List view doesn't need full message hydration — callers that need
    // messages call get(id) for a specific conversation.
    return rows.map((row) => rowToConversation(row, [], []));
  }
}

function rowToConversation(
  row: Record<string, unknown>,
  messageRows: Record<string, unknown>[],
  switchRows: Record<string, unknown>[]
): Conversation {
  return {
    id: row.id as string,
    projectId: (row.project_id as string) ?? undefined,
    title: row.title as string,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
    messages: messageRows.map(rowToMessage),
    memoryRefIds: [],
    fileRefIds: [],
    modelHistory: switchRows.map(rowToSwitchEvent),
    settings: JSON.parse(row.settings_json as string) as ConversationSettings,
    pinned: row.pinned === 1,
    archived: row.archived === 1,
    summary: (row.summary as string) ?? undefined,
    summaryUpToMessageIndex: (row.summary_up_to_index as number) ?? undefined,
  };
}

function rowToMessage(row: Record<string, unknown>): QusinMessage {
  return {
    id: row.id as string,
    role: row.role as QusinMessage["role"],
    parts: JSON.parse(row.parts_json as string),
    provider: (row.provider as QusinMessage["provider"]) ?? undefined,
    model: (row.model as string) ?? undefined,
    finishReason: (row.finish_reason as QusinMessage["finishReason"]) ?? undefined,
    usage: row.usage_json ? JSON.parse(row.usage_json as string) : undefined,
    metadata: row.metadata_json ? JSON.parse(row.metadata_json as string) : undefined,
    timestamp: row.timestamp as number,
  };
}

function rowToSwitchEvent(row: Record<string, unknown>): ModelSwitchEvent {
  return {
    id: row.id as string,
    fromProvider: (row.from_provider as ModelSwitchEvent["fromProvider"]) ?? undefined,
    fromModel: (row.from_model as string) ?? undefined,
    toProvider: row.to_provider as ModelSwitchEvent["toProvider"],
    toModel: row.to_model as string,
    atMessageIndex: row.at_message_index as number,
    reason: row.reason as ModelSwitchEvent["reason"],
    timestamp: row.timestamp as number,
  };
}

export const conversationStore = new ConversationStore();
