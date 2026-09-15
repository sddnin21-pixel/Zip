import { getDb } from "../../storage/db";
import type { LocalModelRecord } from "./types";

/**
 * Persists LocalModelRecord rows (one per downloaded GGUF file) so the
 * Local Model Manager UI and LocalProvider#listModels survive app restarts.
 * Backed by the same SQLite database as the rest of Qusin's storage
 * (brief section 45/46 — local-first persistence).
 */
class LocalModelStore {
  private initialized = false;

  private async init(): Promise<void> {
    if (this.initialized) return;
    const db = await getDb();
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS local_models (
        id TEXT PRIMARY KEY,
        repo TEXT NOT NULL,
        quantization TEXT NOT NULL,
        display_name TEXT NOT NULL,
        file_name TEXT NOT NULL,
        download_url TEXT NOT NULL,
        file_size_bytes INTEGER,
        local_path TEXT,
        downloaded_bytes INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        compatible INTEGER NOT NULL,
        runtime TEXT NOT NULL,
        compat_reason TEXT,
        estimated_ram_bytes INTEGER,
        context_length INTEGER,
        added_at INTEGER NOT NULL,
        error TEXT
      );
    `);
    this.initialized = true;
  }

  async list(): Promise<LocalModelRecord[]> {
    await this.init();
    const db = await getDb();
    const rows = await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM local_models ORDER BY added_at DESC`);
    return rows.map(rowToRecord);
  }

  async get(id: string): Promise<LocalModelRecord | undefined> {
    await this.init();
    const db = await getDb();
    const row = await db.getFirstAsync<Record<string, unknown>>(`SELECT * FROM local_models WHERE id = ?`, [id]);
    return row ? rowToRecord(row) : undefined;
  }

  async upsert(record: LocalModelRecord): Promise<void> {
    await this.init();
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO local_models (
        id, repo, quantization, display_name, file_name, download_url,
        file_size_bytes, local_path, downloaded_bytes, status, compatible,
        runtime, compat_reason, estimated_ram_bytes, context_length, added_at, error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        local_path=excluded.local_path,
        downloaded_bytes=excluded.downloaded_bytes,
        status=excluded.status,
        compat_reason=excluded.compat_reason,
        estimated_ram_bytes=excluded.estimated_ram_bytes,
        error=excluded.error`,
      [
        record.id,
        record.repo,
        record.quantization,
        record.displayName,
        record.fileName,
        record.downloadUrl,
        record.fileSizeBytes ?? null,
        record.localPath ?? null,
        record.downloadedBytes,
        record.status,
        record.compatibility.compatible ? 1 : 0,
        record.compatibility.runtime,
        record.compatibility.reason ?? null,
        record.compatibility.estimatedRamBytes ?? null,
        record.contextLength ?? null,
        record.addedAt,
        record.error ?? null,
      ]
    );
  }

  async delete(id: string): Promise<void> {
    await this.init();
    const db = await getDb();
    await db.runAsync(`DELETE FROM local_models WHERE id = ?`, [id]);
  }
}

function rowToRecord(row: Record<string, unknown>): LocalModelRecord {
  return {
    id: row.id as string,
    repo: row.repo as string,
    quantization: row.quantization as string,
    displayName: row.display_name as string,
    fileName: row.file_name as string,
    downloadUrl: row.download_url as string,
    fileSizeBytes: (row.file_size_bytes as number) ?? undefined,
    localPath: (row.local_path as string) ?? undefined,
    downloadedBytes: row.downloaded_bytes as number,
    status: row.status as LocalModelRecord["status"],
    compatibility: {
      compatible: row.compatible === 1,
      runtime: row.runtime as LocalModelRecord["compatibility"]["runtime"],
      reason: (row.compat_reason as string) ?? undefined,
      estimatedRamBytes: (row.estimated_ram_bytes as number) ?? undefined,
    },
    contextLength: (row.context_length as number) ?? undefined,
    addedAt: row.added_at as number,
    error: (row.error as string) ?? undefined,
  };
}

export const localModelStore = new LocalModelStore();
