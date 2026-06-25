import { describe, expect, it } from "vitest";
import { getStorage } from "@/infrastructure/storage/sqlite-storage";
import { INITIAL_SQL } from "@/infrastructure/storage/migrations";
import { createId } from "@/lib/utils";

const storage = getStorage();

async function seedGeneration(): Promise<string> {
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
  return id;
}

describe("generation drafts (real connection)", () => {
  it("creates a draft and points the generation at it when setActive", async () => {
    const genId = await seedGeneration();
    const draft = await storage.generationDrafts.create(
      { id: createId("draft"), generationId: genId, content: "hello", kind: "working", source: "generated" },
      true,
    );
    const gen = await storage.generations.get(genId);
    expect(gen?.activeDraftId).toBe(draft.id);
    const list = await storage.generationDrafts.listByGeneration(genId);
    expect(list).toHaveLength(1);
    expect(list[0].content).toBe("hello");
  });

  it("cascade-deletes drafts when the generation is deleted (no orphans)", async () => {
    const genId = await seedGeneration();
    await storage.generationDrafts.create(
      { id: createId("draft"), generationId: genId, content: "a", kind: "snapshot", source: "edited" },
      true,
    );
    await storage.generationDrafts.create(
      { id: createId("draft"), generationId: genId, content: "b", kind: "snapshot", source: "edited" },
      false,
    );
    await storage.generations.delete(genId);
    const orphans = await storage.generationDrafts.listByGeneration(genId);
    expect(orphans).toEqual([]);
  });

  it("resets the active pointer when the active draft is deleted (no dangling reference)", async () => {
    const genId = await seedGeneration();
    const keep = await storage.generationDrafts.create(
      { id: createId("draft"), generationId: genId, content: "keep", kind: "snapshot", source: "edited" },
      false,
    );
    const active = await storage.generationDrafts.create(
      { id: createId("draft"), generationId: genId, content: "active", kind: "working", source: "edited" },
      true,
    );
    expect((await storage.generations.get(genId))?.activeDraftId).toBe(active.id);

    await storage.generationDrafts.delete(active.id);

    expect(await storage.generationDrafts.get(active.id)).toBeNull();
    expect((await storage.generations.get(genId))?.activeDraftId).toBeUndefined();
    // The non-active draft is untouched.
    expect(await storage.generationDrafts.get(keep.id)).not.toBeNull();
  });

  it("updates working-draft content in place", async () => {
    const genId = await seedGeneration();
    const draft = await storage.generationDrafts.create(
      { id: createId("draft"), generationId: genId, content: "v1", kind: "working", source: "edited" },
      true,
    );
    const updated = await storage.generationDrafts.updateContent(draft.id, "v2");
    expect(updated.content).toBe("v2");
    expect((await storage.generationDrafts.listByGeneration(genId))).toHaveLength(1);
  });

  it("INITIAL_SQL defines the drafts table and the active_draft_id column (schema parity)", () => {
    expect(INITIAL_SQL).toContain("generation_drafts");
    expect(INITIAL_SQL).toContain("active_draft_id");
    expect(INITIAL_SQL).toContain("ON DELETE CASCADE");
  });
});
