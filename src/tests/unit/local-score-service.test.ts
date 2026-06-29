import { afterEach, describe, expect, it } from "vitest";
import { scoreCopyLocal, scoreGenerationLocal } from "@/application/quality/local-score-service";
import { setHotspotAdapter } from "@/infrastructure/hotspot";
import { HotspotAdapter } from "@/infrastructure/hotspot/hotspot-adapter";
import { getStorage } from "@/infrastructure/storage/sqlite-storage";
import { AppErrorException, type LocalScore } from "@/domain/schemas";
import { createId } from "@/lib/utils";

const FIXTURE: LocalScore = { text: "x", score: 4, breakdown: { openers: 2, cta: 2 }, flags: ["cta"] };

class FakeAdapter extends HotspotAdapter {
  public lastText: string | undefined;
  override async score(text: string): Promise<LocalScore> {
    this.lastText = text;
    return { ...FIXTURE, text };
  }
}

afterEach(() => setHotspotAdapter(undefined));

async function seedGeneration(content?: string): Promise<string> {
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
  if (content !== undefined) {
    await getStorage().generations.update(id, { status: "completed", outputContent: content });
  }
  return id;
}

describe("local-score-service", () => {
  it("scoreCopyLocal returns the sidecar score without touching the DB", async () => {
    const fake = new FakeAdapter();
    setHotspotAdapter(fake);
    const r = await scoreCopyLocal("震惊！结局没人想到");
    expect(r.score).toBe(4);
    expect(fake.lastText).toBe("震惊！结局没人想到");
  });

  it("scoreGenerationLocal scores the stored output content", async () => {
    const fake = new FakeAdapter();
    setHotspotAdapter(fake);
    const id = await seedGeneration("Full article body.");
    const r = await scoreGenerationLocal(id);
    expect(r.score).toBe(4);
    expect(fake.lastText).toBe("Full article body.");
  });

  it("does NOT persist the score onto the generation row", async () => {
    setHotspotAdapter(new FakeAdapter());
    const id = await seedGeneration("Body.");
    await scoreGenerationLocal(id);
    const row = await getStorage().generations.get(id);
    // MVP is non-persistent: no localScore field is written.
    expect((row as Record<string, unknown>).localScore).toBeUndefined();
  });

  it("throws EMPTY_CONTENT when the generation has no output", async () => {
    setHotspotAdapter(new FakeAdapter());
    const id = await seedGeneration();
    await expect(scoreGenerationLocal(id)).rejects.toMatchObject({ appError: { code: "EMPTY_CONTENT" } });
  });

  it("propagates a sidecar-down error from the adapter", async () => {
    class DownAdapter extends HotspotAdapter {
      override async score(): Promise<LocalScore> {
        throw new AppErrorException({ code: "SIDECAR_UNAVAILABLE", message: "down", retryable: true });
      }
    }
    setHotspotAdapter(new DownAdapter());
    await expect(scoreCopyLocal("x")).rejects.toMatchObject({ appError: { code: "SIDECAR_UNAVAILABLE" } });
  });
});
