import { describe, expect, it } from "vitest";
import { DocumentService } from "@/application/content/document-service";
import { getStorage } from "@/infrastructure/storage/sqlite-storage";
import { createId } from "@/lib/utils";

const storage = getStorage();
const service = new DocumentService(storage);

async function seedCompletedGeneration(output: string): Promise<string> {
  const id = createId("generation");
  await storage.generations.create({
    id,
    title: "T",
    eventSummary: "S",
    providerProfileSnapshot: {},
    promptTemplateSnapshot: {},
    generationPresetSnapshot: {},
    renderedSystemPrompt: "sys",
    renderedUserPrompt: "usr",
  });
  await storage.generations.update(id, { status: "completed", outputContent: output });
  return id;
}

describe("document service (real connection)", () => {
  it("falls back to outputContent when no draft exists", async () => {
    const genId = await seedCompletedGeneration("original article");
    expect(await service.getEffectiveContent(genId)).toBe("original article");
  });

  it("lazy-seeds a working draft from outputContent on first edit and sets it active", async () => {
    const genId = await seedCompletedGeneration("seed text");
    const draft = await service.ensureWorkingDraft(genId);
    expect(draft.content).toBe("seed text");
    expect(draft.kind).toBe("working");
    expect((await storage.generations.get(genId))?.activeDraftId).toBe(draft.id);
    // Effective content now reads through the active draft.
    expect(await service.getEffectiveContent(genId)).toBe("seed text");
  });

  it("autosaves edits in place without inserting extra drafts", async () => {
    const genId = await seedCompletedGeneration("v0");
    await service.autosave(genId, "v1");
    await service.autosave(genId, "v2");
    expect(await service.getEffectiveContent(genId)).toBe("v2");
    expect(await service.listDrafts(genId)).toHaveLength(1);
  });

  it("reuses the existing active draft instead of re-seeding", async () => {
    const genId = await seedCompletedGeneration("orig");
    const first = await service.ensureWorkingDraft(genId);
    const second = await service.ensureWorkingDraft(genId);
    expect(second.id).toBe(first.id);
  });

  it("rejects draft writes while the generation is not terminal", async () => {
    const id = createId("generation");
    await storage.generations.create({
      id,
      title: "T",
      eventSummary: "S",
      providerProfileSnapshot: {},
      promptTemplateSnapshot: {},
      generationPresetSnapshot: {},
      renderedSystemPrompt: "sys",
      renderedUserPrompt: "usr",
    });
    await storage.generations.update(id, { status: "streaming" });
    await expect(service.ensureWorkingDraft(id)).rejects.toMatchObject({
      appError: { code: "GENERATION_NOT_TERMINAL" },
    });
    await expect(service.autosave(id, "x")).rejects.toMatchObject({
      appError: { code: "GENERATION_NOT_TERMINAL" },
    });
  });
});
