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
  template_id TEXT NOT NULL REFERENCES prompt_templates(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  snapshot TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS generation_presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider_profile_id TEXT NOT NULL REFERENCES provider_profiles(id) ON DELETE RESTRICT,
  prompt_template_id TEXT NOT NULL REFERENCES prompt_templates(id) ON DELETE RESTRICT,
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
  created_at TEXT NOT NULL,
  active_draft_id TEXT REFERENCES generation_drafts(id) ON DELETE SET NULL,
  quality_score TEXT
);

CREATE TABLE IF NOT EXISTS generation_drafts (
  id TEXT PRIMARY KEY,
  generation_id TEXT NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
  label TEXT,
  content TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'snapshot',
  source TEXT NOT NULL DEFAULT 'edited',
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
    database.pragma("foreign_keys = ON");
    database.exec(INITIAL_SQL);
    // Add indexes for query performance
    database.exec("CREATE INDEX IF NOT EXISTS generations_status_idx ON generations(status)");
    database.exec("CREATE INDEX IF NOT EXISTS generations_created_at_idx ON generations(created_at)");
    database.exec("CREATE INDEX IF NOT EXISTS generation_drafts_generation_id_idx ON generation_drafts(generation_id)");
    // Migration: add custom_variable_defaults column if missing
    const columns = database.prepare("PRAGMA table_info(prompt_templates)").all() as Array<{ name: string }>;
    if (!columns.some((c) => c.name === "custom_variable_defaults")) {
      database.exec("ALTER TABLE prompt_templates ADD COLUMN custom_variable_defaults TEXT NOT NULL DEFAULT '{}'");
    }
    // Migration: add active_draft_id to generations for existing installs (nullable, no default = instant).
    const genColumns = database.prepare("PRAGMA table_info(generations)").all() as Array<{ name: string }>;
    if (!genColumns.some((c) => c.name === "active_draft_id")) {
      database.exec("ALTER TABLE generations ADD COLUMN active_draft_id TEXT");
    }
    // Migration: add quality_score (LLM-as-Judge result, JSON) for existing installs.
    if (!genColumns.some((c) => c.name === "quality_score")) {
      database.exec("ALTER TABLE generations ADD COLUMN quality_score TEXT");
    }
    migratePresetPipelineSteps(database);
    // Migration: retrofit foreign-key constraints onto pre-FK installs.
    // SQLite cannot ALTER TABLE ADD CONSTRAINT, so this rebuilds the affected
    // tables. No-op on fresh installs (INITIAL_SQL already creates them with FKs).
    migrateForeignKeyConstraints(database);
  } finally {
    database.close();
  }
}

type SqliteDb = InstanceType<typeof Database>;

/**
 * Opt existing presets into the `apply-controls` step. It used to run
 * unconditionally (a hidden step); now it is registry-driven and preset-gated,
 * so pre-existing presets must list it to preserve their current behavior.
 * Idempotent: skips presets that already include it. Inserted right after
 * `render-prompt` to keep execution order. Malformed JSON rows are left untouched.
 */
export function migratePresetPipelineSteps(database: SqliteDb): void {
  const rows = database
    .prepare("SELECT id, enabled_pipeline_steps FROM generation_presets")
    .all() as Array<{ id: string; enabled_pipeline_steps: string }>;
  const update = database.prepare(
    "UPDATE generation_presets SET enabled_pipeline_steps = ? WHERE id = ?",
  );
  for (const row of rows) {
    let steps: unknown;
    try {
      steps = JSON.parse(row.enabled_pipeline_steps);
    } catch {
      continue;
    }
    if (!Array.isArray(steps) || steps.includes("apply-controls")) continue;
    const renderIdx = steps.indexOf("render-prompt");
    if (renderIdx >= 0) steps.splice(renderIdx + 1, 0, "apply-controls");
    else steps.push("apply-controls");
    update.run(JSON.stringify(steps), row.id);
  }
}

function tableHasFk(database: SqliteDb, table: string, fromColumn?: string): boolean {
  const fks = database.pragma(`foreign_key_list(${table})`) as Array<{ from: string }>;
  if (!Array.isArray(fks) || fks.length === 0) return false;
  return fromColumn ? fks.some((fk) => fk.from === fromColumn) : true;
}

/**
 * Retrofit FK constraints onto existing tables via the SQLite-recommended
 * table-rebuild procedure (create-copy-drop-rename). Idempotent: each table is
 * rebuilt only if it is missing the constraint. Orphan child rows (which would
 * violate the new constraint) are removed/nulled first so foreign_key_check
 * stays clean after the rebuild.
 */
export function migrateForeignKeyConstraints(database: SqliteDb): void {
  const needsPresets = !tableHasFk(database, "generation_presets");
  const needsVersions = !tableHasFk(database, "prompt_template_versions");
  const needsGenerations = !tableHasFk(database, "generations", "active_draft_id");
  if (!needsPresets && !needsVersions && !needsGenerations) return;

  // The FK pragma is a no-op inside a transaction, so toggle it around the tx.
  database.pragma("foreign_keys = OFF");
  const rebuild = database.transaction(() => {
    if (needsPresets) {
      database.exec(`
        DELETE FROM generation_presets
        WHERE provider_profile_id NOT IN (SELECT id FROM provider_profiles)
           OR prompt_template_id NOT IN (SELECT id FROM prompt_templates);
        CREATE TABLE generation_presets_new (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          provider_profile_id TEXT NOT NULL REFERENCES provider_profiles(id) ON DELETE RESTRICT,
          prompt_template_id TEXT NOT NULL REFERENCES prompt_templates(id) ON DELETE RESTRICT,
          temperature REAL,
          max_tokens INTEGER,
          locale TEXT NOT NULL,
          output_format TEXT NOT NULL,
          enabled_pipeline_steps TEXT NOT NULL,
          is_default INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        INSERT INTO generation_presets_new
          (id, name, provider_profile_id, prompt_template_id, temperature, max_tokens,
           locale, output_format, enabled_pipeline_steps, is_default, created_at, updated_at)
        SELECT id, name, provider_profile_id, prompt_template_id, temperature, max_tokens,
               locale, output_format, enabled_pipeline_steps, is_default, created_at, updated_at
        FROM generation_presets;
        DROP TABLE generation_presets;
        ALTER TABLE generation_presets_new RENAME TO generation_presets;
      `);
    }
    if (needsVersions) {
      database.exec(`
        DELETE FROM prompt_template_versions
        WHERE template_id NOT IN (SELECT id FROM prompt_templates);
        CREATE TABLE prompt_template_versions_new (
          id TEXT PRIMARY KEY,
          template_id TEXT NOT NULL REFERENCES prompt_templates(id) ON DELETE CASCADE,
          version INTEGER NOT NULL,
          snapshot TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        INSERT INTO prompt_template_versions_new (id, template_id, version, snapshot, created_at)
        SELECT id, template_id, version, snapshot, created_at FROM prompt_template_versions;
        DROP TABLE prompt_template_versions;
        ALTER TABLE prompt_template_versions_new RENAME TO prompt_template_versions;
      `);
    }
    if (needsGenerations) {
      database.exec(`
        UPDATE generations SET active_draft_id = NULL
        WHERE active_draft_id IS NOT NULL
          AND active_draft_id NOT IN (SELECT id FROM generation_drafts);
        CREATE TABLE generations_new (
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
          created_at TEXT NOT NULL,
          active_draft_id TEXT REFERENCES generation_drafts(id) ON DELETE SET NULL,
          quality_score TEXT
        );
        INSERT INTO generations_new
          (id, idempotency_key, title, event_summary, provider_profile_snapshot,
           prompt_template_snapshot, generation_preset_snapshot, rendered_system_prompt,
           rendered_user_prompt, output_content, status, error_message, model, provider_kind,
           input_tokens, output_tokens, total_tokens, started_at, completed_at, created_at,
           active_draft_id, quality_score)
        SELECT id, idempotency_key, title, event_summary, provider_profile_snapshot,
               prompt_template_snapshot, generation_preset_snapshot, rendered_system_prompt,
               rendered_user_prompt, output_content, status, error_message, model, provider_kind,
               input_tokens, output_tokens, total_tokens, started_at, completed_at, created_at,
               active_draft_id, quality_score
        FROM generations;
        DROP TABLE generations;
        ALTER TABLE generations_new RENAME TO generations;
        CREATE INDEX IF NOT EXISTS generations_status_idx ON generations(status);
        CREATE INDEX IF NOT EXISTS generations_created_at_idx ON generations(created_at);
      `);
    }
  });
  rebuild();
  const violations = database.pragma("foreign_key_check") as unknown[];
  database.pragma("foreign_keys = ON");
  if (Array.isArray(violations) && violations.length > 0) {
    throw new Error(
      `FK migration left ${violations.length} integrity violation(s); database not modified safely.`,
    );
  }
}

export { INITIAL_SQL };

