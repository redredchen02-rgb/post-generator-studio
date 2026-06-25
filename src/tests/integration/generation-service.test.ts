import { describe, expect, it } from "vitest";
import { createGenerationPreset } from "@/application/presets/preset-service";
import { createProviderProfile } from "@/application/providers/provider-service";
import { streamGeneration } from "@/application/generation/generation-service";
import { mockFetchSSE, mockFetchError } from "../fixtures";

describe("generation use case", () => {
  it("streams fixture provider output and persists the completed generation", async () => {
    const provider = await createProviderProfile({
      name: "Fixture Provider",
      providerKind: "openai-compatible",
      baseUrl: "http://fixture.local",
      model: "fixture-model",
      defaultTemperature: 0.7,
      defaultMaxTokens: 3000,
      enabled: true,
    });
    const preset = await createGenerationPreset({
      name: "Fixture Preset",
      providerProfileId: provider.id,
      promptTemplateId: "template_news_writing",
      locale: "zh-CN",
      outputFormat: "markdown",
      enabledPipelineSteps: ["build-context", "render-prompt", "clean-content", "format-output"],
      isDefault: false,
    });

    const fetchMock = mockFetchSSE([
      'data: {"model":"fixture-model","choices":[{"delta":{"content":"# 测试标题\\n\\n"}}]}',
      'data: {"choices":[{"delta":{"content":"正文内容。"}}],"usage":{"prompt_tokens":10,"completion_tokens":20}}',
      "data: [DONE]",
    ]);

    const events = [];
    for await (const event of streamGeneration({
      title: "测试标题",
      eventSummary: "- 事件一",
      presetId: preset.id,
      providerProfileId: provider.id,
      idempotencyKey: "fixture-idempotency",
    })) {
      events.push(event);
    }

    fetchMock.mockRestore();
    const final = events.find((event) => event.type === "final");
    expect(final?.type).toBe("final");
    if (final?.type === "final") {
      expect(final.generation.status).toBe("completed");
      expect(final.content).toContain("正文内容。");
      expect(final.generation.outputTokens).toBe(20);
    }
  });

  it("maps provider failures to failed generations", async () => {
    const provider = await createProviderProfile({
      name: "Failing Provider",
      providerKind: "openai-compatible",
      baseUrl: "http://failing.local",
      model: "fixture-model",
      defaultTemperature: 0.7,
      defaultMaxTokens: 3000,
      enabled: true,
    });
    const preset = await createGenerationPreset({
      name: "Failing Preset",
      providerProfileId: provider.id,
      promptTemplateId: "template_news_writing",
      locale: "zh-CN",
      outputFormat: "markdown",
      enabledPipelineSteps: ["build-context", "render-prompt", "clean-content", "format-output"],
      isDefault: false,
    });

    const fetchMock = mockFetchError(404, "model missing");
    const events = [];
    for await (const event of streamGeneration({
      title: "失败",
      eventSummary: "模型不存在",
      presetId: preset.id,
      providerProfileId: provider.id,
    })) {
      events.push(event);
    }
    fetchMock.mockRestore();

    const error = events.find((event) => event.type === "error");
    const final = events.find((event) => event.type === "final");
    expect(error?.type).toBe("error");
    if (final?.type === "final") {
      expect(final.generation.status).toBe("failed");
      expect(final.generation.errorMessage).toContain("model missing");
    }
  });
});
