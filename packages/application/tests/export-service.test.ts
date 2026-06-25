import { describe, expect, it } from "vitest";
import { getStorage } from "@postgen/infrastructure/storage/sqlite-storage";
import { exportGeneration } from "@postgen/application/export/export-service";

async function createTestGeneration(title: string) {
  const storage = getStorage();
  return storage.generations.create({
    id: `generation_export_test_${Date.now()}`,
    title,
    eventSummary: "test event",
    renderedSystemPrompt: "system",
    renderedUserPrompt: "user",
    providerProfileSnapshot: {},
    promptTemplateSnapshot: {},
    generationPresetSnapshot: {},
    model: "test-model",
    providerKind: "openai-compatible",
  });
}

describe("export-service", () => {
  it("exports as markdown", async () => {
    const gen = await createTestGeneration("Export Test Md");
    const result = await exportGeneration(gen.id, "md");
    expect(result.filename).toContain(".md");
    expect(result.path).toBeTruthy();
    expect(result.content).toBeDefined();
  });

  it("exports as plain text", async () => {
    const gen = await createTestGeneration("Export Test Txt");
    const result = await exportGeneration(gen.id, "txt");
    expect(result.filename).toContain(".txt");
  });

  it("throws for non-existent generation", async () => {
    await expect(exportGeneration("non-existent", "md")).rejects.toThrow("生成记录不存在");
  });
});
