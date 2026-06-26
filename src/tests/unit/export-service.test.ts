import { describe, expect, it, afterEach, vi } from "vitest";
import { getStorage } from "@/infrastructure/storage/sqlite-storage";
import { exportGeneration } from "@/application/export/export-service";
import { getExportAdapter, setExportAdapter, FsExportAdapter } from "@/infrastructure/export/fs-export-adapter";
import type { ExportPort } from "@/domain/ports/export-port";

async function createTestGeneration(title: string, outputContent?: string) {
  const storage = getStorage();
  const gen = await storage.generations.create({
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
  if (outputContent !== undefined) {
    await storage.generations.update(gen.id, { outputContent });
  }
  return gen;
}

function makeMockAdapter(): ExportPort & { writeCalls: Array<{ path: string; content: string }>; ensureCalls: string[] } {
  const writeCalls: Array<{ path: string; content: string }> = [];
  const ensureCalls: string[] = [];
  return {
    writeCalls,
    ensureCalls,
    async writeFile(filePath, content) { writeCalls.push({ path: filePath, content }); },
    async ensureDir(dirPath) { ensureCalls.push(dirPath); },
  };
}

afterEach(() => {
  setExportAdapter(new FsExportAdapter());
});

describe("export-service (adapter contract)", () => {
  it("calls ensureDir then writeFile via the injected adapter", async () => {
    const mock = makeMockAdapter();
    setExportAdapter(mock);
    const gen = await createTestGeneration("Adapter Test", "# Hello");

    const result = await exportGeneration(gen.id, "md");

    expect(mock.ensureCalls).toHaveLength(1);
    expect(mock.writeCalls).toHaveLength(1);
    expect(mock.writeCalls[0].path).toContain(".md");
    expect(mock.writeCalls[0].content).toBe("# Hello");
    expect(result.filename).toContain(".md");
    expect(result.path).toBe(mock.writeCalls[0].path);
  });

  it("strips markdown for txt format", async () => {
    const mock = makeMockAdapter();
    setExportAdapter(mock);
    const gen = await createTestGeneration("Strip Test", "# Title\n\nBody text");

    await exportGeneration(gen.id, "txt");

    expect(mock.writeCalls[0].content).not.toContain("#");
    expect(mock.writeCalls[0].path).toContain(".txt");
  });

  it("captures correct path and content in mock adapter", async () => {
    const mock = makeMockAdapter();
    setExportAdapter(mock);
    const gen = await createTestGeneration("Path Check", "content here");

    const result = await exportGeneration(gen.id, "md");

    expect(mock.writeCalls[0].path).toBe(result.path);
    expect(mock.writeCalls[0].content).toBe(result.content);
  });
});

describe("export-service (real fs, integration)", () => {
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
