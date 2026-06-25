import { describe, expect, it } from "vitest";
import { AnthropicAdapter } from "@/infrastructure/providers/anthropic";
import type { ProviderProfile } from "@/domain/schemas";

function makeProfile(overrides?: Partial<ProviderProfile>): ProviderProfile {
  return {
    id: "provider_test",
    name: "Test",
    providerKind: "anthropic",
    model: "claude-3-opus",
    defaultTemperature: 0.7,
    defaultMaxTokens: 3000,
    enabled: true,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

describe("AnthropicAdapter", () => {
  it("has correct capabilities", () => {
    const adapter = new AnthropicAdapter();
    const caps = adapter.capabilities();
    expect(caps.supportsStreaming).toBe(true);
    expect(caps.requiresApiKey).toBe(true);
    expect(caps.supportsModelList).toBe(false);
  });

  it("validates config requires API key", async () => {
    const adapter = new AnthropicAdapter();
    const result = await adapter.validateConfig(makeProfile());
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("API_KEY_MISSING");
  });

  it("validates config passes with API key", async () => {
    const adapter = new AnthropicAdapter();
    const result = await adapter.validateConfig(makeProfile(), { apiKey: "sk-test" });
    expect(result.ok).toBe(true);
  });

  it("streams SSE events correctly", async () => {
    const adapter = new AnthropicAdapter();
    const originalFetch = global.fetch;
    global.fetch = async () =>
      new Response(
        [
          'data: {"type":"message_start","message":{"model":"claude-3","usage":{"input_tokens":10,"output_tokens":0}}}',
          "",
          'data: {"type":"content_block_delta","delta":{"text":"Hello"}}',
          "",
          'data: {"type":"message_delta","usage":{"output_tokens":5}}',
          "",
          'data: {"type":"message_stop"}',
          "",
        ].join("\n"),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      );

    const events = [];
    for await (const event of adapter.generate(
      { systemPrompt: "S", userPrompt: "U", model: "claude-3", temperature: 0.7, maxTokens: 100, stream: true },
      makeProfile(),
      { apiKey: "sk-test" },
    )) {
      events.push(event);
    }
    global.fetch = originalFetch;

    expect(events).toContainEqual({ type: "token", value: "Hello" });
    expect(events).toContainEqual({ type: "complete" });
    expect(events.some((e) => e.type === "metadata")).toBe(true);
  });

  it("handles API errors", async () => {
    const adapter = new AnthropicAdapter();
    const originalFetch = global.fetch;
    global.fetch = async () =>
      new Response(JSON.stringify({ error: { message: "rate limited" } }), { status: 429 });

    const events = [];
    for await (const event of adapter.generate(
      { systemPrompt: "S", userPrompt: "U", model: "claude-3", temperature: 0.7, maxTokens: 100, stream: true },
      makeProfile(),
      { apiKey: "sk-test" },
    )) {
      events.push(event);
    }
    global.fetch = originalFetch;

    expect(events.some((e) => e.type === "error")).toBe(true);
  });
});
