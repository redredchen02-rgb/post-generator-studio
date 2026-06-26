import { describe, expect, it } from "vitest";
import {
  getEffectiveContent,
  ensureWorkingDraft,
  autosave,
  listDrafts,
  saveVersion,
  restoreVersion,
} from "@/application/content/document-service";
import { getStorage } from "@/infrastructure/storage/sqlite-storage";
import { createId } from "@/lib/utils";

async function seedCompletedGeneration(output: string): Promise<string> {
  const storage = getStorage();
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
    expect(await getEffectiveContent(genId)).toBe("original article");
  });

  it("lazy-seeds a working draft from outputContent on first edit and sets it active", async () => {
    const genId = await seedCompletedGeneration("seed text");
    const draft = await ensureWorkingDraft(genId);
    expect(draft.content).toBe("seed text");
    expect(draft.kind).toBe("working");
    expect((await getStorage().generations.get(genId))?.activeDraftId).toBe(draft.id);
    // Effective content now reads through the active draft.
    expect(await getEffectiveContent(genId)).toBe("seed text");
  });

  it("autosaves edits in place without inserting extra drafts", async () => {
    const genId = await seedCompletedGeneration("v0");
    await autosave(genId, "v1");
    await autosave(genId, "v2");
    expect(await getEffectiveContent(genId)).toBe("v2");
    expect(await listDrafts(genId)).toHaveLength(1);
  });

  it("reuses the existing active draft instead of re-seeding", async () => {
    const genId = await seedCompletedGeneration("orig");
    const first = await ensureWorkingDraft(genId);
    const second = await ensureWorkingDraft(genId);
    expect(second.id).toBe(first.id);
  });

  it("saves versions in time order without disturbing the working draft", async () => {
    const genId = await seedCompletedGeneration("base");
    await autosave(genId, "edited content");
    const v1 = await saveVersion(genId, "v1");
    await autosave(genId, "edited more");
    const v2 = await saveVersion(genId, "v2");

    expect(v1.kind).toBe("snapshot");
    expect(v1.content).toBe("edited content");
    expect(v2.content).toBe("edited more");
    // Snapshots never become active — the working draft stays live.
    const gen = await getStorage().generations.get(genId);
    const working = (await listDrafts(genId)).find((d) => d.kind === "working");
    expect(gen?.activeDraftId).toBe(working?.id);
    // working + 2 snapshots, oldest first.
    const labels = (await listDrafts(genId)).map((d) => d.label ?? null);
    expect(labels).toEqual([null, "v1", "v2"]);
  });

  it("restores a version into the working draft (snapshot stays frozen)", async () => {
    const genId = await seedCompletedGeneration("base");
    await autosave(genId, "version one");
    const v1 = await saveVersion(genId, "v1");
    await autosave(genId, "version two");

    await restoreVersion(genId, v1.id);
    expect(await getEffectiveContent(genId)).toBe("version one");
    // The snapshot row is unchanged.
    const reloaded = await getStorage().generationDrafts.get(v1.id);
    expect(reloaded?.content).toBe("version one");
  });

  it("refuses to restore a draft from another generation", async () => {
    const a = await seedCompletedGeneration("a");
    const b = await seedCompletedGeneration("b");
    await autosave(b, "b content");
    const bVersion = await saveVersion(b, "vb");
    await expect(restoreVersion(a, bVersion.id)).rejects.toMatchObject({
      appError: { code: "NOT_FOUND" },
    });
  });

  it("rejects draft writes while the generation is not terminal", async () => {
    const storage = getStorage();
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
    await expect(ensureWorkingDraft(id)).rejects.toMatchObject({
      appError: { code: "GENERATION_NOT_TERMINAL" },
    });
    await expect(autosave(id, "x")).rejects.toMatchObject({
      appError: { code: "GENERATION_NOT_TERMINAL" },
    });
  });
});
