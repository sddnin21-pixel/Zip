import { getDb } from "./db";

/**
 * Entities per brief section 45: User, Conversation, Message, Memory,
 * Provider, APIKey, Model (cache, see core/models/catalog-cache.ts),
 * File, AgentTask, ToolCall, GeneratedAsset, Settings, plus Project
 * (section 56) and local_models (providers/local/local-model-store.ts,
 * created by that module directly since it's provider-specific).
 *
 * This file owns every *shared* table. Run once at app startup.
 */
export async function runMigrations(): Promise<void> {
  const db = await getDb();

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      instructions TEXT,
      preferred_provider_id TEXT,
      preferred_model_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      pinned INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      settings_json TEXT NOT NULL,
      summary TEXT,
      summary_up_to_index INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project_id);

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      seq INTEGER NOT NULL,
      role TEXT NOT NULL,
      parts_json TEXT NOT NULL,
      provider TEXT,
      model TEXT,
      finish_reason TEXT,
      usage_json TEXT,
      metadata_json TEXT,
      timestamp INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, seq);

    CREATE TABLE IF NOT EXISTS model_switch_events (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      from_provider TEXT,
      from_model TEXT,
      to_provider TEXT NOT NULL,
      to_model TEXT NOT NULL,
      at_message_index INTEGER NOT NULL,
      reason TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_switch_conv ON model_switch_events(conversation_id);

    CREATE TABLE IF NOT EXISTS memory_entries (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL, -- short_term | conversation | user | project | file | task
      scope_id TEXT,       -- conversation_id or project_id, when type is scoped
      content TEXT NOT NULL,
      embedding_json TEXT, -- optional, for future semantic retrieval
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      pinned INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_memory_type ON memory_entries(type);
    CREATE INDEX IF NOT EXISTS idx_memory_scope ON memory_entries(scope_id);

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      local_uri TEXT NOT NULL,
      extracted_text_preview TEXT,
      destination TEXT NOT NULL DEFAULT 'local', -- 'local' | 'remote' (was/will it be sent to a provider)
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_files_conv ON files(conversation_id);

    CREATE TABLE IF NOT EXISTS providers_keys (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL, -- xkiro | kiraai | openrouter
      name TEXT NOT NULL,
      secure_store_ref TEXT NOT NULL, -- key name in expo-secure-store; the secret itself never lives in SQLite
      masked_preview TEXT NOT NULL,   -- e.g. "sk-or-...a91f"
      enabled INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'unknown', -- unknown | valid | invalid | rate_limited | cooldown
      last_success_at INTEGER,
      last_failure_at INTEGER,
      cooldown_until INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_keys_provider ON providers_keys(provider_id);

    CREATE TABLE IF NOT EXISTS agent_tasks (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      goal TEXT NOT NULL,
      plan_json TEXT,
      status TEXT NOT NULL DEFAULT 'planning', -- planning | running | verifying | done | failed | cancelled
      step_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tool_calls (
      id TEXT PRIMARY KEY,
      task_id TEXT REFERENCES agent_tasks(id) ON DELETE CASCADE,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      tool_name TEXT NOT NULL,
      arguments_json TEXT NOT NULL,
      result_json TEXT,
      is_error INTEGER NOT NULL DEFAULT 0,
      permission_level TEXT NOT NULL, -- read | write | network | execute | system
      confirmed_by_user INTEGER NOT NULL DEFAULT 0,
      started_at INTEGER NOT NULL,
      completed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_toolcalls_conv ON tool_calls(conversation_id);

    CREATE TABLE IF NOT EXISTS generated_assets (
      id TEXT PRIMARY KEY,
      conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
      kind TEXT NOT NULL, -- image | video | docx | pdf | xlsx | pptx | csv
      local_uri TEXT NOT NULL,
      source_skill TEXT NOT NULL,
      prompt TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS model_catalog_cache (
      provider_id TEXT PRIMARY KEY,
      models_json TEXT NOT NULL,
      fetched_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
}
