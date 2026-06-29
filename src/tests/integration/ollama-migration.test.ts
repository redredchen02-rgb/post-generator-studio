import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "@/infrastructure/storage/schema";
import { providerProfiles, generationPresets } from "@/infrastructure/storage/schema";
import { INITIAL_SQL } from "@/infrastructure/storage/migrations";
import { seedDefaults } from "@/infrastructure/storage/seeds";

// Builds a fully-schema'd in-memory DB carrying a stale Ollama profile + a preset
// pointing at it, exactly like an install predating the provider removal.
function legacyDbWithOllama() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(INITIAL_SQL);
  const db = drizzle(sqlite, { schema });
  const now = "2026-01-01T00:00:00.000Z";

  sqlite
    .prepare(
      `INSERT INTO provider_profiles
       (id, name, provider_kind, base_url, model, api_key_ref, key_masked,
        default_temperature, default_max_tokens, enabled, created_at, updated_at)
       VALUES ('provider_ollama_local','Ollama Local','ollama','http://localhost:11434','llama3.1',
               NULL, NULL, 0.7, 3000, 1, ?, ?)`,
    )
    .run(now, now);
  sqlite
    .prepare(
      `INSERT INTO prompt_templates
       (id, name, description, system_prompt, user_prompt_template, supported_variables,
        output_format, version, is_default, created_at, updated_at)
       VALUES ('template_news_writing','t',NULL,'sys','usr','[]','markdown',1,1,?,?)`,
    )
    .run(now, now);
  sqlite
    .prepare(
      `INSERT INTO generation_presets
       (id, name, provider_profile_id, prompt_template_id, temperature, max_tokens, locale,
        output_format, enabled_pipeline_steps, is_default, created_at, updated_at)
       VALUES ('preset_legacy','Legacy','provider_ollama_local','template_news_writing',
               0.7, 3000, 'zh-CN', 'markdown', '[]', 1, ?, ?)`,
    )
    .run(now, now);

  return { sqlite, db };
}

describe("Ollama removal migration (seedDefaults)", () => {
  it("deletes the stale ollama profile and repoints its presets onto the local default", async () => {
    const { sqlite, db } = legacyDbWithOllama();

    await seedDefaults(db);

    const ollama = await db
      .select({ id: providerProfiles.id })
      .from(providerProfiles)
      .where(eq(providerProfiles.providerKind, "ollama"));
    expect(ollama.length).toBe(0);

    const replacement = await db
      .select({ id: providerProfiles.id, enabled: providerProfiles.enabled })
      .from(providerProfiles)
      .where(eq(providerProfiles.id, "provider_local_openai_compatible"));
    expect(replacement.length).toBe(1);
    expect(replacement[0].enabled).toBe(true);

    const preset = await db
      .select({ providerProfileId: generationPresets.providerProfileId })
      .from(generationPresets)
      .where(eq(generationPresets.id, "preset_legacy"));
    expect(preset[0].providerProfileId).toBe("provider_local_openai_compatible");

    sqlite.close();
  });

  it("is idempotent: a second run does not throw and leaves no ollama rows", async () => {
    const { sqlite, db } = legacyDbWithOllama();
    await seedDefaults(db);
    await expect(seedDefaults(db)).resolves.toBeUndefined();
    const ollama = await db
      .select({ id: providerProfiles.id })
      .from(providerProfiles)
      .where(eq(providerProfiles.providerKind, "ollama"));
    expect(ollama.length).toBe(0);
    sqlite.close();
  });
});
