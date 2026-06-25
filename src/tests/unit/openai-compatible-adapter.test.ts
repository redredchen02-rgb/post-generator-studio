import { describe, expect, it } from "vitest";
import { OpenAICompatibleAdapter } from "@/infrastructure/providers/openai-compatible";
import type { ProviderProfile } from "@/domain/schemas";

function makeAdapter(): OpenAICompatibleAdapter {
  return new OpenAICompatibleAdapter({
    id: "openai-compatible",
    defaultBaseUrl: "http://localhost:8000",
    requiresApiKey: false,
  });
}

function makeProfile(baseUrl?: string): ProviderProfile {
  return {
    id: "provider_test",
    name: "Relay",
    providerKind: "openai-compatible",
    baseUrl,
    model: "gemma4-31b-heretic",
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
  model: "gemma4-31b-heretic",
  temperature: 0.7,
  maxTokens: 100,
  stream: true as const,
};

async function captureRequestUrl(baseUrl?: string): Promise<string> {
  let captured = "";
  const originalFetch = global.fetch;
  global.fetch = (async (url: string) => {
    captured = String(url);
    return new Response("data: [DONE]\n\n", {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  }) as typeof fetch;
  try {
    for await (const _event of makeAdapter().generate(request, makeProfile(baseUrl), { apiKey: "k" })) {
      // drain the stream so buildRequest runs
    }
  } finally {
    global.fetch = originalFetch;
  }
  return captured;
}

describe("OpenAICompatibleAdapter URL building", () => {
  it("appends /v1/chat/completions when the base URL has no /v1 segment", async () => {
    const url = await captureRequestUrl("https://relay.example.com");
    expect(url).toBe("https://relay.example.com/v1/chat/completions");
  });

  it("does not double /v1 when the base URL already ends in /v1", async () => {
    const url = await captureRequestUrl("https://la-sealion.inaiai.com/v1");
    expect(url).toBe("https://la-sealion.inaiai.com/v1/chat/completions");
    expect(url).not.toContain("/v1/v1/");
  });

  it("tolerates a trailing slash after /v1", async () => {
    const url = await captureRequestUrl("https://la-sealion.inaiai.com/v1/");
    expect(url).toBe("https://la-sealion.inaiai.com/v1/chat/completions");
  });
});
