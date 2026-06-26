import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migratePresetPipelineSteps } from "@/infrastructure/storage/migrations";

function dbWithPreset(steps: string): InstanceType<typeof Database> {
  const db = new Database(":memory:");
  db.exec(
    "CREATE TABLE generation_presets (id TEXT PRIMARY KEY, enabled_pipeline_steps TEXT NOT NULL)",
  );
  db.prepare("INSERT INTO generation_presets (id, enabled_pipeline_steps) VALUES (?, ?)").run(
    "preset_1",
    steps,
  );
  return db;
}

function readSteps(db: InstanceType<typeof Database>): string[] {
  const row = db
    .prepare("SELECT enabled_pipeline_steps FROM generation_presets WHERE id = 'preset_1'")
    .get() as { enabled_pipeline_steps: string };
  return JSON.parse(row.enabled_pipeline_steps);
}

describe("migratePresetPipelineSteps", () => {
  it("inserts apply-controls right after render-prompt for legacy presets", () => {
    const db = dbWithPreset(
      JSON.stringify(["build-context", "render-prompt", "clean-content", "format-output"]),
    );
    migratePresetPipelineSteps(db);
    expect(readSteps(db)).toEqual([
      "build-context",
      "render-prompt",
      "apply-controls",
      "clean-content",
      "format-output",
    ]);
    db.close();
  });

  it("is idempotent — a preset already containing apply-controls is unchanged", () => {
    const original = ["build-context", "render-prompt", "apply-controls", "clean-content"];
    const db = dbWithPreset(JSON.stringify(original));
    migratePresetPipelineSteps(db);
    migratePresetPipelineSteps(db);
    expect(readSteps(db)).toEqual(original);
    db.close();
  });

  it("appends apply-controls when render-prompt is absent", () => {
    const db = dbWithPreset(JSON.stringify(["build-context", "format-output"]));
    migratePresetPipelineSteps(db);
    expect(readSteps(db)).toEqual(["build-context", "format-output", "apply-controls"]);
    db.close();
  });

  it("leaves malformed JSON rows untouched", () => {
    const db = dbWithPreset("not json");
    expect(() => migratePresetPipelineSteps(db)).not.toThrow();
    const row = db
      .prepare("SELECT enabled_pipeline_steps FROM generation_presets WHERE id = 'preset_1'")
      .get() as { enabled_pipeline_steps: string };
    expect(row.enabled_pipeline_steps).toBe("not json");
    db.close();
  });
});
