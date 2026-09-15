import * as SQLite from "expo-sqlite";

/**
 * Single shared SQLite database for Qusin AI's local-first persistence
 * (brief section 45/46). Every storage module (conversations, memory,
 * files, keys, local models, settings) opens the same DB and creates its
 * own tables — there is exactly one authoritative persistence layer, no
 * parallel storage systems (brief section 75).
 */
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync("qusin.db").then(async (db) => {
      // WAL mode for better concurrent read/write behavior with streaming
      // chat writes happening alongside UI reads.
      await db.execAsync("PRAGMA journal_mode = WAL;");
      await db.execAsync("PRAGMA foreign_keys = ON;");
      return db;
    });
  }
  return dbPromise;
}

/** Test-only: force a fresh in-memory database, used by unit tests so they don't touch the real on-device file. */
export async function resetDbForTests(): Promise<SQLite.SQLiteDatabase> {
  dbPromise = SQLite.openDatabaseAsync(":memory:");
  return dbPromise;
}
