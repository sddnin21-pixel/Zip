import { getDb } from "../../storage/db";
import type { FileRecord } from "./file-types";

class FileStore {
  async create(record: FileRecord): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO files (id, conversation_id, project_id, file_name, mime_type, size_bytes, local_uri, extracted_text_preview, destination, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.conversationId ?? null,
        record.projectId ?? null,
        record.fileName,
        record.mimeType,
        record.sizeBytes,
        record.localUri,
        record.extractedTextPreview ?? null,
        record.destination,
        record.createdAt,
      ]
    );
  }

  async get(id: string): Promise<FileRecord | undefined> {
    const db = await getDb();
    const row = await db.getFirstAsync<Record<string, unknown>>(`SELECT * FROM files WHERE id = ?`, [id]);
    return row ? rowToRecord(row) : undefined;
  }

  async listForConversation(conversationId: string): Promise<FileRecord[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM files WHERE conversation_id = ? ORDER BY created_at ASC`,
      [conversationId]
    );
    return rows.map(rowToRecord);
  }

  async delete(id: string): Promise<void> {
    const db = await getDb();
    await db.runAsync(`DELETE FROM files WHERE id = ?`, [id]);
  }
}

function rowToRecord(row: Record<string, unknown>): FileRecord {
  return {
    id: row.id as string,
    conversationId: (row.conversation_id as string) ?? undefined,
    projectId: (row.project_id as string) ?? undefined,
    fileName: row.file_name as string,
    mimeType: row.mime_type as string,
    sizeBytes: row.size_bytes as number,
    localUri: row.local_uri as string,
    extractedTextPreview: (row.extracted_text_preview as string) ?? undefined,
    destination: row.destination as FileRecord["destination"],
    createdAt: row.created_at as number,
  };
}

export const fileStore = new FileStore();
