import { describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/generations/[id]/drafts/route";
import { getStorage } from "@/infrastructure/storage/sqlite-storage";
import { createId } from "@/lib/utils";

async function seedCompleted(output: string): Promise<string> {
  const id = createId("generation");
  await getStorage().generations.create({
    id,
    title: "T",
    eventSummary: "S",
    providerProfileSnapshot: {},
    promptTemplateSnapshot: {},
    generationPresetSnapshot: {},
    renderedSystemPrompt: "sys",
    renderedUserPrompt: "usr",
  });
  await getStorage().generations.update(id, { status: "completed", outputContent: output });
  return id;
}

function post(id: string, body: unknown) {
  const request = new Request(`http://test/api/generations/${id}/drafts`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  return POST(request, { params: Promise.resolve({ id }) });
}

function get(id: string) {
  return GET(new Request(`http://test/api/generations/${id}/drafts`), { params: Promise.resolve({ id }) });
}

describe("/api/generations/[id]/drafts (integration)", () => {
  it("autosaves, saves a version, restores, and reads state back", async () => {
    const id = await seedCompleted("base");

    await post(id, { action: "autosave", content: "edit one" });
    const saved = await (await post(id, { action: "saveVersion", label: "v1" })).json();
    expect(saved.kind).toBe("snapshot");

    await post(id, { action: "autosave", content: "edit two" });

    const state = await (await get(id)).json();
    expect(state.effectiveContent).toBe("edit two");
    expect(state.drafts).toHaveLength(2); // working + 1 snapshot
    expect(state.activeDraftId).toBeTruthy();

    const restored = await (await post(id, { action: "restore", draftId: saved.id })).json();
    expect(restored.content).toBe("edit one");
    expect((await (await get(id)).json()).effectiveContent).toBe("edit one");
  });

  it("rejects an autosave while the generation is still streaming", async () => {
    const id = createId("generation");
    await getStorage().generations.create({
      id,
      title: "T",
      eventSummary: "S",
      providerProfileSnapshot: {},
      promptTemplateSnapshot: {},
      generationPresetSnapshot: {},
      renderedSystemPrompt: "sys",
      renderedUserPrompt: "usr",
    });
    await getStorage().generations.update(id, { status: "streaming" });
    const response = await post(id, { action: "autosave", content: "x" });
    expect(response.status).toBeGreaterThanOrEqual(400);
    const body = await response.json();
    expect(body.error.code).toBe("GENERATION_NOT_TERMINAL");
  });

  it("rejects an unknown action", async () => {
    const id = await seedCompleted("base");
    const response = await post(id, { action: "nope" });
    expect(response.status).toBe(400);
  });
});
