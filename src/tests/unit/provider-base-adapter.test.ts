import { afterEach, describe, expect, it } from "vitest";
import { GeminiAdapter } from "@/infrastructure/providers/gemini";
import {
  BaseAdapter,
  type ChunkParseResult,
  type RequestBuildResult,
} from "@/infrastructure/providers/base-adapter";
import type { GenerationEvent, NormalizedGenerationRequest, ProviderProfile } from "@/domain/schemas";

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

  it("surfaces an observable error for a malformed JSON-lines chunk and stops", async () => {
    // Non-event-stream content-type routes through the JSON-lines parser.
    global.fetch = (async () =>
      new Response('{"candidates":[]}\n{not valid json\n', {
        status: 200,
        headers: { "Content-Type": "application/x-ndjson" },
      })) as typeof fetch;
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

// A bare adapter that does not opt into completion (supportsCompletion defaults false).
class NoCompletionAdapter extends BaseAdapter {
  readonly id = "no-completion";
  protected async buildRequest(): Promise<RequestBuildResult> {
    return { url: "http://x", init: { method: "POST" } };
  }
  protected parseChunk(): ChunkParseResult {
    return { events: [] };
  }
}

describe("BaseAdapter.complete capability gate", () => {
  it("throws when the adapter does not advertise completion support", async () => {
    const adapter = new NoCompletionAdapter();
    expect(adapter.capabilities().supportsCompletion).toBe(false);
    await expect(adapter.complete(request, makeProfile())).rejects.toThrow("不支持一次性补全");
  });
});

describe("GeminiAdapter.complete (non-streaming)", () => {
  it("hits :generateContent and returns the parsed full text", async () => {
    let capturedUrl = "";
    let capturedBody: NormalizedGenerationRequest | undefined;
    global.fetch = (async (url: string, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedBody = init?.body ? JSON.parse(String(init.body)) : undefined;
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "FULL TEXT" }] } }],
          usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 9 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const result = await new GeminiAdapter().complete(request, makeProfile(), { apiKey: "k" });
    expect(capturedUrl).toContain(":generateContent");
    expect(capturedUrl).not.toContain("alt=sse");
    expect(capturedBody).toBeDefined();
    expect(result.content).toBe("FULL TEXT");
    expect(result.inputTokens).toBe(3);
    expect(result.outputTokens).toBe(9);
  });
});
