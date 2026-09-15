import { getDb } from "./db";

/**
 * Generic settings key-value store backing brief section 35's settings
 * sections (General, Providers, Web Search, etc). Each setting is a
 * JSON-serialized value under a dotted key, e.g. "web_search.searxng_base_url".
 */
export async function getSetting<T>(key: string): Promise<T | undefined> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value_json: string }>(`SELECT value_json FROM settings WHERE key = ?`, [
    key,
  ]);
  return row ? (JSON.parse(row.value_json) as T) : undefined;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
    [key, JSON.stringify(value), Date.now()]
  );
}

export async function deleteSetting(key: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM settings WHERE key = ?`, [key]);
}

export async function listSettings(prefix?: string): Promise<Record<string, unknown>> {
  const db = await getDb();
  const rows = prefix
    ? await db.getAllAsync<{ key: string; value_json: string }>(`SELECT * FROM settings WHERE key LIKE ?`, [
        `${prefix}%`,
      ])
    : await db.getAllAsync<{ key: string; value_json: string }>(`SELECT * FROM settings`);
  return Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value_json)]));
}
