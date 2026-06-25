import { afterEach, describe, expect, it } from "vitest";
import { GeminiAdapter } from "@/infrastructure/providers/gemini";
import type { GenerationEvent, ProviderProfile } from "@/domain/schemas";

function makeProfile(): ProviderProfile {
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
  };
}

const request = {
  systemPrompt: "S",
  userPrompt: "U",
  model: "gemini-pro",
  temperature: 0.7,
  maxTokens: 100,
  stream: true as const,
};

async function collect(adapter: GeminiAdapter): Promise<GenerationEvent[]> {
  const events: GenerationEvent[] = [];
  for await (const event of adapter.generate(request, makeProfile(), { apiKey: "test-key" })) {
    events.push(event);
  }
  return events;
}

function sse(...lines: string[]): Response {
  return new Response([...lines, ""].join("\n"), {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  delete process.env.POST_GENERATOR_PROVIDER_TIMEOUT_MS;
});

describe("BaseAdapter hardening (via GeminiAdapter)", () => {
  it("emits a retryable error when the provider request times out", async () => {
    process.env.POST_GENERATOR_PROVIDER_TIMEOUT_MS = "30";
    // A fetch that never resolves until the timeout signal aborts it.
    global.fetch = ((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("timed out", "TimeoutError")),
        );
      })) as typeof fetch;

    const events = await collect(new GeminiAdapter());
    const error = events.find((e) => e.type === "error");
    expect(error).toBeDefined();
    expect(error).toMatchObject({ type: "error", retryable: true });
  });

  it("surfaces an observable error for a non-object chunk instead of dropping it", async () => {
    global.fetch = (async () => sse("data: 42")) as typeof fetch;
    const events = await collect(new GeminiAdapter());
    expect(events.some((e) => e.type === "error")).toBe(true);
  });

  it("surfaces an observable error for an unparseable data chunk", async () => {
    global.fetch = (async () => sse("data: {not valid json")) as typeof fetch;
    const events = await collect(new GeminiAdapter());
    expect(events.some((e) => e.type === "error")).toBe(true);
  });

  it("still streams tokens normally on the happy path", async () => {
    global.fetch = (async () =>
      sse(
        'data: {"candidates":[{"content":{"parts":[{"text":"Hi"}]}}]}',
        "",
        "data: [DONE]",
      )) as typeof fetch;
    const events = await collect(new GeminiAdapter());
    expect(events).toContainEqual({ type: "token", value: "Hi" });
    expect(events).toContainEqual({ type: "complete" });
    expect(events.some((e) => e.type === "error")).toBe(false);
  });
});
