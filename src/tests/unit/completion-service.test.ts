import { afterEach, describe, expect, it, vi } from "vitest";
import { completeText } from "@/application/content/completion-service";
import { createProviderProfile } from "@/application/providers/provider-service";
import { createGenerationPreset } from "@/application/presets/preset-service";

function mockFetchJson(payload: unknown, status = 200) {
  return vi.spyOn(global, "fetch").mockResolvedValue(
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

async function seedPreset(enabled = true) {
  const provider = await createProviderProfile({
    name: "Completion Provider",
    providerKind: "openai-compatible",
    baseUrl: "http://relay.local",
    model: "test-model",
    defaultTemperature: 0.7,
    defaultMaxTokens: 3000,
    enabled,
  });
  const preset = await createGenerationPreset({
    name: "Completion Preset",
    providerProfileId: provider.id,
    promptTemplateId: "template_news_writing",
    locale: "zh-CN",
    outputFormat: "markdown",
  });
  return { provider, preset };
}

describe("completion-service", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the full completion text and token usage", async () => {
    const { preset } = await seedPreset();
    mockFetchJson({
      choices: [{ message: { content: "REWRITTEN PARAGRAPH" } }],
      model: "test-model",
      usage: { prompt_tokens: 5, completion_tokens: 7 },
    });

    const result = await completeText({ prompt: "Rewrite this", presetId: preset.id });

    expect(result.content).toBe("REWRITTEN PARAGRAPH");
    expect(result.model).toBe("test-model");
    expect(result.inputTokens).toBe(5);
    expect(result.outputTokens).toBe(7);
  });

  it("sends a non-streaming request (stream:false, no stream_options)", async () => {
    const { preset } = await seedPreset();
    const spy = mockFetchJson({ choices: [{ message: { content: "ok" } }] });

    await completeText({ prompt: "Hi", presetId: preset.id });

    const init = spy.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.stream).toBe(false);
    expect(body.stream_options).toBeUndefined();
  });

  it("rejects a disabled provider with a structured error", async () => {
    const { preset } = await seedPreset(false);
    await expect(completeText({ prompt: "Hi", presetId: preset.id })).rejects.toThrow("供应商未启用");
  });

  it("surfaces an observable error when the provider returns an unexpected structure", async () => {
    const { preset } = await seedPreset();
    mockFetchJson({ unexpected: true });
    await expect(completeText({ prompt: "Hi", presetId: preset.id })).rejects.toThrow("非预期的补全结构");
  });

  it("rejects an invalid body before touching the provider", async () => {
    await expect(completeText({ prompt: "", presetId: "x" })).rejects.toThrow();
  });
});
