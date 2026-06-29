import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { getStorage } from "@/infrastructure/storage/sqlite-storage";
import { migrateForeignKeyConstraints } from "@/infrastructure/storage/migrations";
import { createId } from "@/lib/utils";

describe("foreign key constraints (integration, seeded DB)", () => {
  it("blocks deleting a provider profile that a preset still references", async () => {
    // Seed creates preset_1 -> provider_local_openai_compatible, so the delete must be refused.
    await expect(getStorage().providerProfiles.delete("provider_local_openai_compatible")).rejects.toThrow(
      /无法删除/,
    );
  });

  it("blocks deleting a prompt template that a preset still references", async () => {
    await expect(getStorage().promptTemplates.delete("template_news_writing")).rejects.toThrow(
      /无法删除/,
    );
  });

  it("allows deleting a provider profile once nothing references it", async () => {
    const id = createId("provider");
    await getStorage().providerProfiles.create({
      id,
      name: "Unreferenced",
      providerKind: "openai-compatible",
      model: "local-model",
      defaultTemperature: 0.7,
      defaultMaxTokens: 3000,
      enabled: false,
    });
    await expect(getStorage().providerProfiles.delete(id)).resolves.toBeUndefined();
  });
});

describe("migrateForeignKeyConstraints (pre-FK table rebuild retrofit)", () => {
  // Builds a DB where every table the migration inspects already has its FK
  // EXCEPT generation_presets, so only the preset rebuild path executes.
  function preFkPresetDb(): InstanceType<typeof Database> {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(`
      CREATE TABLE provider_profiles (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE prompt_templates (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE prompt_template_versions (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL REFERENCES prompt_templates(id) ON DELETE CASCADE,
        version INTEGER NOT NULL, snapshot TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE generation_drafts (id TEXT PRIMARY KEY);
      CREATE TABLE generations (
        id TEXT PRIMARY KEY,
        active_draft_id TEXT REFERENCES generation_drafts(id) ON DELETE SET NULL
      );
      -- Pre-FK shape: no REFERENCES on the two parent columns.
      CREATE TABLE generation_presets (
        id TEXT PRIMARY KEY, name TEXT NOT NULL,
        provider_profile_id TEXT NOT NULL, prompt_template_id TEXT NOT NULL,
        temperature REAL, max_tokens INTEGER, locale TEXT NOT NULL,
        output_format TEXT NOT NULL, enabled_pipeline_steps TEXT NOT NULL,
        is_default INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
    `);
    db.prepare("INSERT INTO provider_profiles VALUES ('p1','P')").run();
    db.prepare("INSERT INTO prompt_templates VALUES ('t1','T')").run();
    return db;
  }

  function insertPreset(db: InstanceType<typeof Database>, id: string, provider: string, template: string): void {
    db.prepare(
      `INSERT INTO generation_presets VALUES (?, ?, ?, ?, NULL, NULL, 'zh-CN', 'markdown', '[]', 0, 'now', 'now')`,
    ).run(id, id, provider, template);
  }

  it("adds the FK, drops orphaned rows, keeps valid rows, and then enforces RESTRICT", () => {
    const db = preFkPresetDb();
    insertPreset(db, "valid", "p1", "t1");
    insertPreset(db, "orphan", "ghost-provider", "t1"); // provider does not exist

    migrateForeignKeyConstraints(db);

    const fks = db.pragma("foreign_key_list(generation_presets)") as unknown[];
    expect(fks.length).toBeGreaterThan(0);

    const rows = db.prepare("SELECT id FROM generation_presets ORDER BY id").all() as Array<{ id: string }>;
    expect(rows.map((r) => r.id)).toEqual(["valid"]);

    const violations = db.pragma("foreign_key_check") as unknown[];
    expect(violations.length).toBe(0);

    // The referenced provider can no longer be deleted while the preset uses it.
    expect(() => db.prepare("DELETE FROM provider_profiles WHERE id = 'p1'").run()).toThrow(
      /FOREIGN KEY constraint failed/,
    );
    db.close();
  });

  it("is idempotent: a second run on an already-migrated DB is a no-op", () => {
    const db = preFkPresetDb();
    insertPreset(db, "valid", "p1", "t1");
    migrateForeignKeyConstraints(db);
    // Second run should detect the FK already exists and do nothing / not throw.
    expect(() => migrateForeignKeyConstraints(db)).not.toThrow();
    const rows = db.prepare("SELECT id FROM generation_presets").all();
    expect(rows.length).toBe(1);
    db.close();
  });
});
