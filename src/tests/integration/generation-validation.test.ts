import { describe, expect, it } from "vitest";
import { validateGenerationRequest, CachedGenerationError } from "@/application/generation/generation-validation";
import { createGenerationPreset } from "@/application/presets/preset-service";
import { createProviderProfile } from "@/application/providers/provider-service";
import { getStorage } from "@/infrastructure/storage/sqlite-storage";
import { createId } from "@/lib/utils";

async function setup(opts?: { enabled?: boolean }) {
  const provider = await createProviderProfile({
    name: "V Provider",
    providerKind: "openai-compatible",
    baseUrl: "http://fixture.local",
    model: "fixture-model",
    defaultTemperature: 0.7,
    defaultMaxTokens: 3000,
    enabled: opts?.enabled ?? true,
  });
  const preset = await createGenerationPreset({
    name: "V Preset",
    providerProfileId: provider.id,
    promptTemplateId: "template_news_writing",
    locale: "zh-CN",
    outputFormat: "markdown",
    enabledPipelineSteps: ["build-context", "render-prompt"],
    isDefault: false,
  });
  return { provider, preset };
}

const baseReq = (presetId: string, extra: Record<string, unknown> = {}) => ({
  title: "T",
  eventSummary: "S",
  presetId,
  ...extra,
});

describe("validateGenerationRequest", () => {
  it("resolves preset/provider/template for a valid request", async () => {
    const { preset, provider } = await setup();
    const validated = await validateGenerationRequest(baseReq(preset.id));
    expect(validated.preset.id).toBe(preset.id);
    expect(validated.provider.id).toBe(provider.id);
    expect(validated.template.id).toBe("template_news_writing");
  });

  it("throws PRESET_NOT_FOUND for an unknown preset", async () => {
    await expect(validateGenerationRequest(baseReq("preset_missing"))).rejects.toThrow(/not found/i);
  });

  it("throws when the resolved provider is disabled", async () => {
    const { preset } = await setup({ enabled: false });
    await expect(validateGenerationRequest(baseReq(preset.id))).rejects.toThrow(/disabled/i);
  });

  it("replays a completed generation as CachedGenerationError on idempotency hit", async () => {
    const { preset } = await setup();
    const key = createId("idem");
    const completed = await getStorage().generations.create({
      id: createId("gen"),
      idempotencyKey: key,
      title: "T",
      eventSummary: "S",
      providerProfileSnapshot: {},
      promptTemplateSnapshot: {},
      generationPresetSnapshot: {},
      renderedSystemPrompt: "S",
      renderedUserPrompt: "U",
      model: "fixture-model",
    });
    await getStorage().generations.update(completed.id, { status: "completed", outputContent: "cached body" });

    await expect(
      validateGenerationRequest(baseReq(preset.id, { idempotencyKey: key })),
    ).rejects.toMatchObject({ generation: expect.objectContaining({ outputContent: "cached body" }) });
    await expect(
      validateGenerationRequest(baseReq(preset.id, { idempotencyKey: key })),
    ).rejects.toBeInstanceOf(CachedGenerationError);
  });
});
