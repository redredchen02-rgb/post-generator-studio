import { describe, expect, it, vi } from "vitest";
import { getGenerationPreset, listGenerationPresets } from "@/application/presets/preset-service";
import { getDb } from "@/infrastructure/storage/db";
import { generationPresets } from "@/infrastructure/storage/schema";
import { logger } from "@/infrastructure/logging/logger";
import { createId, nowIso } from "@/lib/utils";

/**
 * Local-first safety: a stored preset row can carry a stale/unknown step id (the
 * e2e lineage once used "generate-content"/"persist-generation"). Reading it must
 * NOT throw — that would brick the whole preset list for a user we can't migrate.
 * The read path strips the unknown id and warns.
 */
async function insertRawPreset(enabledPipelineSteps: string[]): Promise<string> {
  const db = await getDb();
  const id = createId("preset");
  const ts = nowIso();
  db.insert(generationPresets)
    .values({
      id,
      name: "Legacy Preset",
      providerProfileId: "provider_local_openai_compatible",
      promptTemplateId: "template_news_writing",
      temperature: null,
      maxTokens: null,
      locale: "zh-CN",
      outputFormat: "markdown",
      enabledPipelineSteps: JSON.stringify(enabledPipelineSteps),
      isDefault: false,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
  return id;
}

describe("generation-preset repo — tolerant read", () => {
  it("strips unknown step ids on read instead of throwing", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const id = await insertRawPreset(["build-context", "typo-step", "render-prompt"]);

    const preset = await getGenerationPreset(id);
    expect(preset.enabledPipelineSteps).toEqual(["build-context", "render-prompt"]);
    expect(warn).toHaveBeenCalledWith(
      "Dropped unknown pipeline step ids from preset",
      expect.objectContaining({ presetId: id, dropped: ["typo-step"] }),
    );
    warn.mockRestore();
  });

  it("a single bad row does not fail list() for the whole set", async () => {
    vi.spyOn(logger, "warn").mockImplementation(() => {});
    await insertRawPreset(["build-context", "generate-content", "persist-generation"]);

    // Must resolve, not reject — the brick scenario the plan guards against.
    const all = await listGenerationPresets();
    const legacy = all.find((p) => p.name === "Legacy Preset");
    expect(legacy?.enabledPipelineSteps).toEqual(["build-context"]);
  });
});
