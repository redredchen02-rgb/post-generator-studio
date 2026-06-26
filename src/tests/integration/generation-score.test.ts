import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/generations/[id]/score/route";
import { createProviderProfile } from "@/application/providers/provider-service";
import { createGenerationPreset } from "@/application/presets/preset-service";
import { getStorage } from "@/infrastructure/storage/sqlite-storage";
import { createId } from "@/lib/utils";

const JUDGE_FIXTURE = {
  relevance: { score: 5, justification: "On topic." },
  coherence: { score: 4, justification: "Flows." },
  factuality: { score: 4, justification: "Grounded." },
  style: { score: 4, justification: "Engaging." },
  completeness: { score: 3, justification: "A bit short." },
};

function mockJudgeReply(content: string, model = "judge-model") {
  return vi.spyOn(global, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ choices: [{ message: { content } }], model }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

async function seed() {
  const provider = await createProviderProfile({
    name: "Score Provider",
    providerKind: "openai-compatible",
    baseUrl: "http://relay.local",
    model: "judge-model",
    defaultTemperature: 0.2,
    defaultMaxTokens: 2000,
    enabled: true,
  });
  const preset = await createGenerationPreset({
    name: "Score Preset",
    providerProfileId: provider.id,
    promptTemplateId: "template_news_writing",
    locale: "zh-CN",
    outputFormat: "markdown",
  });
  const id = createId("generation");
  await getStorage().generations.create({
    id,
    title: "Recap",
    eventSummary: "Shipped v1.",
    providerProfileSnapshot: {},
    promptTemplateSnapshot: {},
    generationPresetSnapshot: {},
    renderedSystemPrompt: "sys",
    renderedUserPrompt: "usr",
  });
  await getStorage().generations.update(id, { status: "completed", outputContent: "A full article.", model: "gen-model" });
  return { preset, id };
}

function postScore(id: string, body: unknown) {
  const request = new Request(`http://test/api/generations/${id}/score`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  return POST(request, { params: Promise.resolve({ id }) });
}

describe("POST /api/generations/[id]/score (integration)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("scores, persists, and reads back the quality score", async () => {
    const { preset, id } = await seed();
    mockJudgeReply(JSON.stringify(JUDGE_FIXTURE));

    const response = await postScore(id, { presetId: preset.id });
    expect(response.status).toBe(200);
    const score = await response.json();
    // (5+4+4+4+3)/5 = 4.0
    expect(score.overall).toBe(4);
    expect(score.selfEvaluated).toBe(false);

    const reloaded = await getStorage().generations.get(id);
    expect(reloaded?.qualityScore?.overall).toBe(4);
    expect(reloaded?.qualityScore?.completeness.justification).toBe("A bit short.");
  });

  it("rejects a malformed JSON request body with INVALID_BODY", async () => {
    const { id } = await seed();
    const request = new Request(`http://test/api/generations/${id}/score`, {
      method: "POST",
      body: "{not json",
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request, { params: Promise.resolve({ id }) });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("INVALID_BODY");
  });

  it("clears a stale score when the content is edited afterward", async () => {
    const { preset, id } = await seed();
    mockJudgeReply(JSON.stringify(JUDGE_FIXTURE));
    await postScore(id, { presetId: preset.id });
    expect((await getStorage().generations.get(id))?.qualityScore?.overall).toBe(4);

    // Editing the content invalidates the score it described.
    await getStorage().generations.update(id, { outputContent: "A different, edited article." });
    expect((await getStorage().generations.get(id))?.qualityScore).toBeUndefined();
  });

  it("returns a structured error on a malformed judge reply without writing", async () => {
    const { preset, id } = await seed();
    mockJudgeReply("not json");

    const response = await postScore(id, { presetId: preset.id });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("JUDGE_PARSE_FAILED");

    const reloaded = await getStorage().generations.get(id);
    expect(reloaded?.qualityScore).toBeUndefined();
  });
});
