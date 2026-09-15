import { getDb } from "../../storage/db";
import * as Crypto from "expo-crypto";

export type MemoryType = "short_term" | "conversation" | "user" | "project" | "file" | "task";

export interface MemoryEntry {
  id: string;
  type: MemoryType;
  /** conversationId or projectId, when this memory is scoped rather than global (type "user" is global). */
  scopeId?: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
}

/**
 * Provider-independent memory store (brief section 18/19). Nothing here
 * knows about XKIRO/KiraAI/OpenRouter/local — the context manager is what
 * turns relevant MemoryEntry rows into text that gets packed into whatever
 * model is currently selected. This is what makes memory survive a
 * provider switch: Qusin retrieves and re-injects it explicitly every time,
 * never relies on "the model remembers."
 */
class MemoryStore {
  async add(type: MemoryType, content: string, scopeId?: string): Promise<MemoryEntry> {
    const entry: MemoryEntry = {
      id: Crypto.randomUUID(),
      type,
      scopeId,
      content,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pinned: false,
    };
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO memory_entries (id, type, scope_id, content, created_at, updated_at, pinned)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [entry.id, entry.type, entry.scopeId ?? null, entry.content, entry.createdAt, entry.updatedAt]
    );
    return entry;
  }

  async update(id: string, content: string): Promise<void> {
    const db = await getDb();
    await db.runAsync(`UPDATE memory_entries SET content = ?, updated_at = ? WHERE id = ?`, [
      content,
      Date.now(),
      id,
    ]);
  }

  async setPinned(id: string, pinned: boolean): Promise<void> {
    const db = await getDb();
    await db.runAsync(`UPDATE memory_entries SET pinned = ? WHERE id = ?`, [pinned ? 1 : 0, id]);
  }

  async delete(id: string): Promise<void> {
    const db = await getDb();
    await db.runAsync(`DELETE FROM memory_entries WHERE id = ?`, [id]);
  }

  async clearAll(): Promise<void> {
    const db = await getDb();
    await db.runAsync(`DELETE FROM memory_entries`);
  }

  async clearType(type: MemoryType, scopeId?: string): Promise<void> {
    const db = await getDb();
    if (scopeId) {
      await db.runAsync(`DELETE FROM memory_entries WHERE type = ? AND scope_id = ?`, [type, scopeId]);
    } else {
      await db.runAsync(`DELETE FROM memory_entries WHERE type = ?`, [type]);
    }
  }

  async list(type?: MemoryType, scopeId?: string): Promise<MemoryEntry[]> {
    const db = await getDb();
    let rows: Record<string, unknown>[];
    if (type && scopeId) {
      rows = await db.getAllAsync(
        `SELECT * FROM memory_entries WHERE type = ? AND scope_id = ? ORDER BY pinned DESC, updated_at DESC`,
        [type, scopeId]
      );
    } else if (type) {
      rows = await db.getAllAsync(`SELECT * FROM memory_entries WHERE type = ? ORDER BY pinned DESC, updated_at DESC`, [
        type,
      ]);
    } else {
      rows = await db.getAllAsync(`SELECT * FROM memory_entries ORDER BY pinned DESC, updated_at DESC`);
    }
    return rows.map(rowToEntry);
  }

  /**
   * Naive keyword-overlap relevance search. No embedding model is bundled
   * (brief doesn't mandate semantic search, and shipping a local embedding
   * model just for memory retrieval would be a large, separately-riskable
   * addition) — this is deliberately simple and correct rather than fake.
   */
  async search(query: string, limit = 10): Promise<MemoryEntry[]> {
    const all = await this.list();
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2);
    if (terms.length === 0) return all.slice(0, limit);

    const scored = all
      .map((entry) => {
        const haystack = entry.content.toLowerCase();
        const score = terms.reduce((acc, term) => acc + (haystack.includes(term) ? 1 : 0), 0);
        return { entry, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score || b.entry.updatedAt - a.entry.updatedAt);

    return scored.slice(0, limit).map((s) => s.entry);
  }

  async export(): Promise<MemoryEntry[]> {
    return this.list();
  }
}

function rowToEntry(row: Record<string, unknown>): MemoryEntry {
  return {
    id: row.id as string,
    type: row.type as MemoryType,
    scopeId: (row.scope_id as string) ?? undefined,
    content: row.content as string,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
    pinned: row.pinned === 1,
  };
}

export const memoryStore = new MemoryStore();
