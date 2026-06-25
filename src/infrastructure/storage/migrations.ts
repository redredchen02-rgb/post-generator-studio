import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { getBackupsDir, getDataHome, getDatabasePath, getExportsDir, getLogsDir, getSecretsDir } from "@/infrastructure/config/paths";

const INITIAL_SQL = `
CREATE TABLE IF NOT EXISTS provider_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider_kind TEXT NOT NULL,
  base_url TEXT,
  model TEXT NOT NULL,
  api_key_ref TEXT,
  key_masked TEXT,
  default_temperature REAL NOT NULL,
  default_max_tokens INTEGER NOT NULL,
  enabled INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prompt_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  user_prompt_template TEXT NOT NULL,
  supported_variables TEXT NOT NULL,
  custom_variable_defaults TEXT NOT NULL DEFAULT '{}',
  output_format TEXT NOT NULL,
  version INTEGER NOT NULL,
  is_default INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prompt_template_versions (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  snapshot TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS generation_presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider_profile_id TEXT NOT NULL,
  prompt_template_id TEXT NOT NULL,
  temperature REAL,
  max_tokens INTEGER,
  locale TEXT NOT NULL,
  output_format TEXT NOT NULL,
  enabled_pipeline_steps TEXT NOT NULL,
  is_default INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS generations (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT UNIQUE,
  title TEXT NOT NULL,
  event_summary TEXT NOT NULL,
  provider_profile_snapshot TEXT NOT NULL,
  prompt_template_snapshot TEXT NOT NULL,
  generation_preset_snapshot TEXT NOT NULL,
  rendered_system_prompt TEXT NOT NULL,
  rendered_user_prompt TEXT NOT NULL,
  output_content TEXT,
  status TEXT NOT NULL,
  error_message TEXT,
  model TEXT,
  provider_kind TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL
);
`;

export async function ensureStorageDirectories(): Promise<void> {
  await Promise.all([
    fs.mkdir(getDataHome(), { recursive: true }),
    fs.mkdir(getSecretsDir(), { recursive: true }),
    fs.mkdir(getExportsDir(), { recursive: true }),
    fs.mkdir(getLogsDir(), { recursive: true }),
    fs.mkdir(getBackupsDir(), { recursive: true }),
    fs.mkdir(path.dirname(getDatabasePath()), { recursive: true }),
  ]);
}

export async function runMigrations(): Promise<void> {
  await ensureStorageDirectories();
  const database = new Database(getDatabasePath());
  try {
    database.pragma("journal_mode = WAL");
    database.exec(INITIAL_SQL);
    // Add indexes for query performance
    database.exec("CREATE INDEX IF NOT EXISTS generations_status_idx ON generations(status)");
    database.exec("CREATE INDEX IF NOT EXISTS generations_created_at_idx ON generations(created_at)");
    // Migration: add custom_variable_defaults column if missing
    const columns = database.prepare("PRAGMA table_info(prompt_templates)").all() as Array<{ name: string }>;
    if (!columns.some((c) => c.name === "custom_variable_defaults")) {
      database.exec("ALTER TABLE prompt_templates ADD COLUMN custom_variable_defaults TEXT NOT NULL DEFAULT '{}'");
    }
  } finally {
    database.close();
  }
}

export { INITIAL_SQL };

