import { describe, expect, it } from "vitest";
import { OpenAICompatibleAdapter } from "@postgen/infrastructure/providers/openai-compatible";
import type { ProviderProfile } from "@postgen/domain";

describe("provider response normalizer", () => {
  it("normalizes OpenAI-compatible SSE chunks", async () => {
    const adapter = new OpenAICompatibleAdapter({
      id: "fixture",
      defaultBaseUrl: "http://fixture.local",
      requiresApiKey: false,
    });
    const originalFetch = global.fetch;
    global.fetch = async () =>
      new Response(
        [
          'data: {"model":"fixture-model","choices":[{"delta":{"content":"Hello "}}]}',
          "",
          'data: {"choices":[{"delta":{"content":"world"}}],"usage":{"prompt_tokens":2,"completion_tokens":3}}',
          "",
          "data: [DONE]",
          "",
        ].join("\n"),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      );

    const profile: ProviderProfile = {
      id: "provider",
      name: "Fixture",
      providerKind: "openai-compatible",
      baseUrl: "http://fixture.local",
      model: "fixture-model",
      defaultTemperature: 0.7,
      defaultMaxTokens: 100,
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const events = [];
    for await (const event of adapter.generate(
      {
        systemPrompt: "System",
        userPrompt: "User",
        model: "fixture-model",
        temperature: 0.7,
        maxTokens: 100,
        stream: true,
      },
      profile,
    )) {
      events.push(event);
    }

    global.fetch = originalFetch;
    expect(events).toContainEqual({ type: "token", value: "Hello " });
    expect(events).toContainEqual({ type: "token", value: "world" });
    expect(events).toContainEqual({ type: "complete" });
  });
});

