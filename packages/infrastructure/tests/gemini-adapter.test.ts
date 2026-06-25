import { describe, expect, it } from "vitest";
import { GeminiAdapter } from "@postgen/infrastructure/providers/gemini";
import type { ProviderProfile } from "@postgen/domain";

function makeProfile(overrides?: Partial<ProviderProfile>): ProviderProfile {
  return {
    id: "provider_test",
    name: "Test",
    providerKind: "gemini",
    model: "gemini-pro",
    defaultTemperature: 0.7,
    defaultMaxTokens: 3000,
    enabled: true,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

describe("GeminiAdapter", () => {
  it("has correct capabilities", () => {
    const adapter = new GeminiAdapter();
    const caps = adapter.capabilities();
    expect(caps.supportsStreaming).toBe(true);
    expect(caps.requiresApiKey).toBe(true);
    expect(caps.supportsModelList).toBe(true);
  });

  it("validates config requires API key", async () => {
    const adapter = new GeminiAdapter();
    const result = await adapter.validateConfig(makeProfile());
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("API_KEY_MISSING");
  });

  it("streams SSE events correctly", async () => {
    const adapter = new GeminiAdapter();
    const originalFetch = global.fetch;
    global.fetch = async () =>
      new Response(
        [
          'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}',
          "",
          'data: {"candidates":[{"content":{"parts":[{"text":" world"}]}}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":3}}',
          "",
          "data: [DONE]",
          "",
        ].join("\n"),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      );

    const events = [];
    for await (const event of adapter.generate(
      { systemPrompt: "S", userPrompt: "U", model: "gemini-pro", temperature: 0.7, maxTokens: 100, stream: true },
      makeProfile(),
      { apiKey: "test-key" },
    )) {
      events.push(event);
    }
    global.fetch = originalFetch;

    expect(events).toContainEqual({ type: "token", value: "Hello" });
    expect(events).toContainEqual({ type: "token", value: " world" });
    expect(events).toContainEqual({ type: "complete" });
  });

  it("handles API errors", async () => {
    const adapter = new GeminiAdapter();
    const originalFetch = global.fetch;
    global.fetch = async () =>
      new Response(JSON.stringify({ error: { message: "quota exceeded" } }), { status: 429 });

    const events = [];
    for await (const event of adapter.generate(
      { systemPrompt: "S", userPrompt: "U", model: "gemini-pro", temperature: 0.7, maxTokens: 100, stream: true },
      makeProfile(),
      { apiKey: "test-key" },
    )) {
      events.push(event);
    }
    global.fetch = originalFetch;

    expect(events.some((e) => e.type === "error")).toBe(true);
  });
});
