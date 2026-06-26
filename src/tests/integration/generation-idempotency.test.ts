import { describe, expect, it } from "vitest";
import { getStorage } from "@/infrastructure/storage/sqlite-storage";
import { createId } from "@/lib/utils";

function baseInput(id: string, idempotencyKey: string) {
  return {
    id,
    idempotencyKey,
    title: "Idempotency test",
    eventSummary: "summary",
    providerProfileSnapshot: {},
    promptTemplateSnapshot: {},
    generationPresetSnapshot: {},
    renderedSystemPrompt: "S",
    renderedUserPrompt: "U",
  };
}

describe("generation.create idempotency (integration)", () => {
  it("returns the existing generation when the same idempotencyKey is reused", async () => {
    const key = createId("idem");
    const first = await getStorage().generations.create(baseInput(createId("gen"), key));
    // A concurrent/retried request: different row id, same idempotencyKey.
    const second = await getStorage().generations.create(baseInput(createId("gen"), key));

    expect(second.id).toBe(first.id);
    expect(second.idempotencyKey).toBe(key);

    // No duplicate row was created.
    const found = await getStorage().generations.getByIdempotencyKey(key);
    expect(found?.id).toBe(first.id);
  });

  it("still creates distinct rows for distinct idempotency keys", async () => {
    const a = await getStorage().generations.create(baseInput(createId("gen"), createId("idem")));
    const b = await getStorage().generations.create(baseInput(createId("gen"), createId("idem")));
    expect(a.id).not.toBe(b.id);
  });
});
