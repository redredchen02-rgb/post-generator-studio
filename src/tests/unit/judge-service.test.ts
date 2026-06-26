import { afterEach, describe, expect, it, vi } from "vitest";
import { scoreGeneration } from "@/application/quality/judge-service";
import { createProviderProfile } from "@/application/providers/provider-service";
import { createGenerationPreset } from "@/application/presets/preset-service";
import { getStorage } from "@/infrastructure/storage/sqlite-storage";
import { createId } from "@/lib/utils";

const JUDGE_FIXTURE = {
  relevance: { score: 5, justification: "Stays on topic." },
  coherence: { score: 4, justification: "Clear progression." },
  factuality: { score: 4, justification: "Grounded in the summary." },
  style: { score: 3, justification: "Readable but plain." },
  completeness: { score: 4, justification: "Satisfying close." },
};

function mockJudgeReply(content: string, model = "judge-model") {
  return vi.spyOn(global, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({ choices: [{ message: { content } }], model, usage: { prompt_tokens: 9, completion_tokens: 30 } }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
}

async function seedPresetAndGeneration(opts: { content?: string; genModel?: string } = {}) {
  const provider = await createProviderProfile({
    name: "Judge Provider",
    providerKind: "openai-compatible",
    baseUrl: "http://relay.local",
    model: "judge-model",
    defaultTemperature: 0.2,
    defaultMaxTokens: 2000,
    enabled: true,
  });
  const preset = await createGenerationPreset({
    name: "Judge Preset",
    providerProfileId: provider.id,
    promptTemplateId: "template_news_writing",
    locale: "zh-CN",
    outputFormat: "markdown",
  });
  const id = createId("generation");
  await getStorage().generations.create({
    id,
    title: "Launch recap",
    eventSummary: "We shipped v1 today.",
    providerProfileSnapshot: {},
    promptTemplateSnapshot: {},
    generationPresetSnapshot: {},
    renderedSystemPrompt: "sys",
    renderedUserPrompt: "usr",
  });
  if (opts.content !== undefined || opts.genModel) {
    await getStorage().generations.update(id, {
      status: "completed",
      outputContent: opts.content ?? "Full article body.",
      model: opts.genModel,
      completedAt: "2026-06-26T00:00:00.000Z",
    });
  }
  return { preset, generationId: id };
}

describe("judge-service", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a structured score with overall computed from the five dimensions", async () => {
    const { preset, generationId } = await seedPresetAndGeneration({ content: "A solid article.", genModel: "gen-model" });
    mockJudgeReply(JSON.stringify(JUDGE_FIXTURE));

    const score = await scoreGeneration(generationId, { presetId: preset.id });

    expect(score.relevance.score).toBe(5);
    expect(score.style.justification).toBe("Readable but plain.");
    // (5+4+4+3+4)/5 = 4.0
    expect(score.overall).toBe(4);
    expect(score.judgeModel).toBe("judge-model");
  });

  it("persists the score so it can be read back from the generation", async () => {
    const { preset, generationId } = await seedPresetAndGeneration({ content: "A solid article.", genModel: "gen-model" });
    mockJudgeReply(JSON.stringify(JUDGE_FIXTURE));

    await scoreGeneration(generationId, { presetId: preset.id });

    const reloaded = await getStorage().generations.get(generationId);
    expect(reloaded?.qualityScore?.overall).toBe(4);
    expect(reloaded?.qualityScore?.relevance.score).toBe(5);
  });

  it("flags selfEvaluated when the judge model equals the generation model", async () => {
    const { preset, generationId } = await seedPresetAndGeneration({ content: "Body.", genModel: "judge-model" });
    mockJudgeReply(JSON.stringify(JUDGE_FIXTURE), "judge-model");

    const score = await scoreGeneration(generationId, { presetId: preset.id });
    expect(score.selfEvaluated).toBe(true);
  });

  it("does not flag selfEvaluated when judge and generation models differ", async () => {
    const { preset, generationId } = await seedPresetAndGeneration({ content: "Body.", genModel: "gen-model" });
    mockJudgeReply(JSON.stringify(JUDGE_FIXTURE), "judge-model");

    const score = await scoreGeneration(generationId, { presetId: preset.id });
    expect(score.selfEvaluated).toBe(false);
  });

  it("unwraps a fenced JSON reply", async () => {
    const { preset, generationId } = await seedPresetAndGeneration({ content: "Body.", genModel: "gen-model" });
    mockJudgeReply("```json\n" + JSON.stringify(JUDGE_FIXTURE) + "\n```");

    const score = await scoreGeneration(generationId, { presetId: preset.id });
    expect(score.overall).toBe(4);
  });

  it("throws an observable error on a non-JSON reply and writes nothing", async () => {
    const { preset, generationId } = await seedPresetAndGeneration({ content: "Body.", genModel: "gen-model" });
    mockJudgeReply("I cannot score this.");

    await expect(scoreGeneration(generationId, { presetId: preset.id })).rejects.toThrow();
    const reloaded = await getStorage().generations.get(generationId);
    expect(reloaded?.qualityScore).toBeUndefined();
  });

  it("throws on a reply missing a dimension", async () => {
    const { preset, generationId } = await seedPresetAndGeneration({ content: "Body.", genModel: "gen-model" });
    const { factuality: _omit, ...partial } = JUDGE_FIXTURE;
    void _omit;
    mockJudgeReply(JSON.stringify(partial));

    await expect(scoreGeneration(generationId, { presetId: preset.id })).rejects.toThrow();
  });

  it("refuses to score an empty generation", async () => {
    const { preset, generationId } = await seedPresetAndGeneration({ content: "   ", genModel: "gen-model" });
    const spy = mockJudgeReply(JSON.stringify(JUDGE_FIXTURE));

    await expect(scoreGeneration(generationId, { presetId: preset.id })).rejects.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });
});
