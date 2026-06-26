import { describe, expect, it } from "vitest";
import { cancelGeneration } from "@/application/generation/generation-service";
import { registerGenerationController } from "@/application/generation/cancel-registry";
import { getStorage } from "@/infrastructure/storage/sqlite-storage";
import { createId } from "@/lib/utils";

async function createStreamingGeneration(): Promise<string> {
  const id = createId("gen");
  await getStorage().generations.create({
    id,
    title: "Cancel test",
    eventSummary: "summary",
    providerProfileSnapshot: {},
    promptTemplateSnapshot: {},
    generationPresetSnapshot: {},
    renderedSystemPrompt: "S",
    renderedUserPrompt: "U",
  });
  return id;
}

describe("cancelGeneration (integration)", () => {
  it("flips a registered generation to cancelled in storage", async () => {
    const id = await createStreamingGeneration();
    registerGenerationController(id, new AbortController());

    const result = await cancelGeneration(id);

    expect(result.cancelled).toBe(true);
    const stored = await getStorage().generations.get(id);
    expect(stored?.status).toBe("cancelled");
    expect(stored?.errorMessage).toBe("生成请求被取消");
    expect(stored?.completedAt).toBeTruthy();
  });

  it("does not mutate the record when no controller is registered", async () => {
    const id = await createStreamingGeneration();
    const before = await getStorage().generations.get(id);

    const result = await cancelGeneration(id);

    expect(result.cancelled).toBe(false);
    const after = await getStorage().generations.get(id);
    expect(after?.status).toBe(before?.status);
  });
});

describe("generation.update terminal-state guard (cancel-vs-complete race)", () => {
  // better-sqlite3 transactions are synchronous and serialized, so the read +
  // canTransition + write in update() runs atomically. These tests prove the
  // *logical* race protection: whichever terminal status commits first wins,
  // and a later conflicting terminal update is rejected without overwriting it.
  it("keeps a completed generation when a late cancellation arrives", async () => {
    const repo = getStorage().generations;
    const id = await createStreamingGeneration(); // status: queued

    const completed = await repo.update(id, { status: "completed", outputContent: "final text" });
    expect(completed.status).toBe("completed");

    const afterLateCancel = await repo.update(id, { status: "cancelled", errorMessage: "late cancel" });
    expect(afterLateCancel.status).toBe("completed");
    expect(afterLateCancel.outputContent).toBe("final text");

    const stored = await repo.get(id);
    expect(stored?.status).toBe("completed");
    expect(stored?.outputContent).toBe("final text");
  });

  it("keeps a cancelled generation when a late completion arrives", async () => {
    const repo = getStorage().generations;
    const id = await createStreamingGeneration();

    const cancelled = await repo.update(id, { status: "cancelled", errorMessage: "user cancelled" });
    expect(cancelled.status).toBe("cancelled");

    const afterLateComplete = await repo.update(id, { status: "completed", outputContent: "should be dropped" });
    expect(afterLateComplete.status).toBe("cancelled");
    expect(afterLateComplete.outputContent ?? null).toBeNull();

    const stored = await repo.get(id);
    expect(stored?.status).toBe("cancelled");
  });
});
