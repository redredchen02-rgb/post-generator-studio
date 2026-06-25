import { describe, expect, it } from "vitest";
import { cancelGeneration } from "@/application/generation/generation-service";
import { registerGenerationController } from "@/application/generation/cancel-registry";
import { getStorage } from "@/infrastructure/storage/sqlite-storage";
import { createId } from "@/lib/utils";

async function createStreamingGeneration(): Promise<string> {
  const id = createId();
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
