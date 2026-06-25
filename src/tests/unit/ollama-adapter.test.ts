import { describe, expect, it } from "vitest";
import { OllamaAdapter } from "@/infrastructure/providers/ollama";
import type { ProviderProfile } from "@/domain/schemas";

function makeProfile(overrides?: Partial<ProviderProfile>): ProviderProfile {
  return {
    id: "provider_test",
    name: "Test",
    providerKind: "ollama",
    baseUrl: "http://localhost:11434",
    model: "llama3",
    defaultTemperature: 0.7,
    defaultMaxTokens: 3000,
    enabled: true,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

describe("OllamaAdapter", () => {
  it("has correct capabilities", () => {
    const adapter = new OllamaAdapter();
    const caps = adapter.capabilities();
    expect(caps.supportsStreaming).toBe(true);
    expect(caps.requiresApiKey).toBe(false);
    expect(caps.supportsModelList).toBe(true);
  });

  it("validates config requires baseUrl", async () => {
    const adapter = new OllamaAdapter();
    const result = await adapter.validateConfig(makeProfile({ baseUrl: "" }));
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("BASE_URL_MISSING");
  });

  it("validates config passes with baseUrl", async () => {
    const adapter = new OllamaAdapter();
    const result = await adapter.validateConfig(makeProfile());
    expect(result.ok).toBe(true);
  });

  it("streams JSON lines correctly", async () => {
    const adapter = new OllamaAdapter();
    const originalFetch = global.fetch;
    global.fetch = async () =>
      new Response(
        [
          JSON.stringify({ message: { content: "Hello" } }),
          JSON.stringify({ message: { content: " world" } }),
          JSON.stringify({ done: true, model: "llama3", prompt_eval_count: 10, eval_count: 5 }),
        ].join("\n"),
        { status: 200, headers: { "Content-Type": "application/x-ndjson" } },
      );

    const events = [];
    for await (const event of adapter.generate(
      { systemPrompt: "S", userPrompt: "U", model: "llama3", temperature: 0.7, maxTokens: 100, stream: true },
      makeProfile(),
    )) {
      events.push(event);
    }
    global.fetch = originalFetch;

    expect(events).toContainEqual({ type: "token", value: "Hello" });
    expect(events).toContainEqual({ type: "token", value: " world" });
    expect(events.some((e) => e.type === "metadata")).toBe(true);
    expect(events).toContainEqual({ type: "complete" });
  });

  it("handles connection errors", async () => {
    const adapter = new OllamaAdapter();
    const originalFetch = global.fetch;
    global.fetch = async () =>
      new Response(JSON.stringify({ error: "connection refused" }), { status: 500 });

    const events = [];
    for await (const event of adapter.generate(
      { systemPrompt: "S", userPrompt: "U", model: "llama3", temperature: 0.7, maxTokens: 100, stream: true },
      makeProfile(),
    )) {
      events.push(event);
    }
    global.fetch = originalFetch;

    expect(events.some((e) => e.type === "error")).toBe(true);
  });
});
