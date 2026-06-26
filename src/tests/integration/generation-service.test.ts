import { describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { createGenerationPreset } from "@/application/presets/preset-service";
import { createProviderProfile } from "@/application/providers/provider-service";
import { streamGeneration, cancelGeneration } from "@/application/generation/generation-service";
import { cancelGenerationController } from "@/application/generation/cancel-registry";
import { getStorage } from "@/infrastructure/storage/sqlite-storage";
import { cacheInvalidate } from "@/infrastructure/security/secrets";
import { getSecretsDir } from "@/infrastructure/config/paths";
import { createId } from "@/lib/utils";
import { mockFetchSSE, mockFetchError } from "../fixtures";

async function setupProviderPreset(name: string) {
  const provider = await createProviderProfile({
    name: `${name} Provider`,
    providerKind: "openai-compatible",
    baseUrl: "http://fixture.local",
    model: "fixture-model",
    defaultTemperature: 0.7,
    defaultMaxTokens: 3000,
    enabled: true,
  });
  const preset = await createGenerationPreset({
    name: `${name} Preset`,
    providerProfileId: provider.id,
    promptTemplateId: "template_news_writing",
    locale: "zh-CN",
    outputFormat: "markdown",
    enabledPipelineSteps: ["build-context", "render-prompt", "clean-content", "format-output"],
    isDefault: false,
  });
  return { provider, preset };
}

function rawGeneration(idempotencyKey: string) {
  return {
    id: createId("gen"),
    idempotencyKey,
    title: "Prior attempt",
    eventSummary: "summary",
    providerProfileSnapshot: {},
    promptTemplateSnapshot: {},
    generationPresetSnapshot: {},
    renderedSystemPrompt: "S",
    renderedUserPrompt: "U",
  };
}

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

describe("generation setup error handling", () => {
  it("marks a generation failed (not stuck on queued) and releases the controller when secret read throws", async () => {
    const provider = await createProviderProfile({
      name: "Corrupt-Secret Provider",
      providerKind: "openai-compatible",
      baseUrl: "http://fixture.local",
      model: "fixture-model",
      apiKey: "sk-will-be-corrupted-123456",
      defaultTemperature: 0.7,
      defaultMaxTokens: 3000,
      enabled: true,
    });
    const preset = await createGenerationPreset({
      name: "Corrupt-Secret Preset",
      providerProfileId: provider.id,
      promptTemplateId: "template_news_writing",
      locale: "zh-CN",
      outputFormat: "markdown",
      enabledPipelineSteps: ["build-context", "render-prompt", "clean-content", "format-output"],
      isDefault: false,
    });

    // Corrupt the on-disk secret so readSecret throws mid-setup — after the row +
    // controller are registered, the exact window the fix now guards.
    expect(provider.apiKeyRef).toBeTruthy();
    cacheInvalidate(provider.apiKeyRef);
    await fs.writeFile(path.join(getSecretsDir(), `${provider.apiKeyRef}.json`), "{ corrupt", { mode: 0o600 });

    const events = [];
    for await (const event of streamGeneration({
      title: "设置失败",
      eventSummary: "secret 损坏",
      presetId: preset.id,
      providerProfileId: provider.id,
    })) {
      events.push(event);
    }

    const generationEvent = events.find((e) => e.type === "generation");
    const final = events.find((e) => e.type === "final");
    expect(events.some((e) => e.type === "error")).toBe(true);
    expect(final?.type).toBe("final");
    if (final?.type === "final") {
      expect(final.generation.status).toBe("failed");
    }
    if (generationEvent?.type === "generation") {
      const stored = await getStorage().generations.get(generationEvent.generation.id);
      expect(stored?.status).toBe("failed"); // not left on "queued"
      // Controller was released (no leak): a follow-up cancel finds nothing registered.
      const reCancel = await cancelGeneration(generationEvent.generation.id);
      expect(reCancel.cancelled).toBe(false);
    }
  });
});

describe("generation idempotency semantics", () => {
  it("rejects a reused idempotencyKey while the original is still in flight", async () => {
    const key = createId("idem");
    const inflight = await getStorage().generations.create(rawGeneration(key));
    await getStorage().generations.update(inflight.id, { status: "streaming", startedAt: new Date().toISOString() });

    const run = (async () => {
      for await (const _event of streamGeneration({
        title: "dup",
        eventSummary: "s",
        presetId: "preset_whatever",
        idempotencyKey: key,
      })) {
        // drain
      }
    })();

    await expect(run).rejects.toMatchObject({ appError: { code: "GENERATION_IN_PROGRESS" } });
    // No duplicate row was created; the in-flight row is untouched.
    const stillInflight = await getStorage().generations.getByIdempotencyKey(key);
    expect(stillInflight?.id).toBe(inflight.id);
    expect(stillInflight?.status).toBe("streaming");
  });

  it("supersedes a failed generation when the same idempotencyKey is retried", async () => {
    const { provider, preset } = await setupProviderPreset("Idem-Retry");
    const key = createId("idem");
    const failed = await getStorage().generations.create(rawGeneration(key));
    await getStorage().generations.update(failed.id, { status: "failed", errorMessage: "boom" });

    const fetchMock = mockFetchSSE([
      'data: {"choices":[{"delta":{"content":"retry body"}}]}',
      "data: [DONE]",
    ]);
    const events = [];
    for await (const event of streamGeneration({
      title: "retry",
      eventSummary: "s",
      presetId: preset.id,
      providerProfileId: provider.id,
      idempotencyKey: key,
    })) {
      events.push(event);
    }
    fetchMock.mockRestore();

    const final = events.find((e) => e.type === "final");
    expect(final?.type).toBe("final");
    if (final?.type === "final") {
      expect(final.generation.status).toBe("completed"); // old code returned the stale failed row
      expect(final.generation.id).not.toBe(failed.id); // a fresh row, not the superseded one
    }
    const byKey = await getStorage().generations.getByIdempotencyKey(key);
    expect(byKey?.status).toBe("completed");
    expect(await getStorage().generations.get(failed.id)).toBeNull(); // stale row deleted
  });
});

describe("generation mid-stream cancel", () => {
  it("records a mid-stream cancel as cancelled, not a retryable failure, even before the cancel write lands", async () => {
    const { provider, preset } = await setupProviderPreset("Mid-Cancel");

    // A provider stream that only errors once the request's abort signal fires.
    vi.spyOn(global, "fetch").mockImplementation(((_url: string, init?: RequestInit) => {
      const signal = init?.signal;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const fail = () => controller.error(new DOMException("Aborted", "AbortError"));
          if (signal?.aborted) {
            fail();
            return;
          }
          signal?.addEventListener("abort", fail, { once: true });
        },
      });
      return Promise.resolve(
        new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } }),
      );
    }) as unknown as typeof fetch);

    const events = [];
    for await (const event of streamGeneration({
      title: "取消",
      eventSummary: "s",
      presetId: preset.id,
      providerProfileId: provider.id,
    })) {
      events.push(event);
      if (event.type === "generation") {
        // Abort the controller WITHOUT writing the cancelled status — reproduces the
        // race where the stream's catch runs before cancelGeneration's DB write lands.
        // Old (status-based) detection misread this as a retryable "failed".
        cancelGenerationController(event.generation.id);
      }
    }
    vi.restoreAllMocks();

    const final = events.find((e) => e.type === "final");
    expect(final?.type).toBe("final");
    if (final?.type === "final") {
      expect(final.generation.status).toBe("cancelled");
    }
    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent?.type === "error" && errorEvent.retryable).toBe(false);
  });
});
