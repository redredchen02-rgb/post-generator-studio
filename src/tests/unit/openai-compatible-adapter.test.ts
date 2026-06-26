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

describe("OpenAICompatibleAdapter.listModels URL building", () => {
  async function captureListModelsUrl(baseUrl?: string): Promise<string> {
    let captured = "";
    const originalFetch = global.fetch;
    global.fetch = (async (url: string) => {
      captured = String(url);
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
    try {
      await makeAdapter().listModels(makeProfile(baseUrl));
    } finally {
      global.fetch = originalFetch;
    }
    return captured;
  }

  it("hits /v1/models when base URL has no /v1 segment", async () => {
    const url = await captureListModelsUrl("https://relay.example.com");
    expect(url).toBe("https://relay.example.com/v1/models");
  });

  it("does not double /v1 for listModels when base URL already ends in /v1", async () => {
    const url = await captureListModelsUrl("https://la-sealion.inaiai.com/v1");
    expect(url).toBe("https://la-sealion.inaiai.com/v1/models");
    expect(url).not.toContain("/v1/v1/");
  });
});

describe("OpenAICompatibleAdapter.listModels non-200 response", () => {
  it("returns [] when the endpoint responds with a non-200 status", async () => {
    const originalFetch = global.fetch;
    global.fetch = (async () =>
      new Response("Internal Server Error", { status: 500 })) as typeof fetch;
    try {
      const models = await makeAdapter().listModels(makeProfile("https://relay.example.com"));
      expect(models).toEqual([]);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe("OpenAICompatibleAdapter URL building — non-terminal /v1", () => {
  it("appends /v1 when base URL has /v1 as a non-terminal segment", async () => {
    const url = await captureRequestUrl("https://example.com/v1/proxy");
    // /v1/proxy does not end with /v1 so another /v1 is appended
    expect(url).toBe("https://example.com/v1/proxy/v1/chat/completions");
    expect(url).not.toContain("/v1/v1/chat");
  });
});

describe("OpenAICompatibleAdapter.listModels early return", () => {
  it("returns [] without fetching when requiresApiKey=true and no key provided", async () => {
    const adapter = new OpenAICompatibleAdapter({
      id: "needs-key",
      defaultBaseUrl: "http://localhost:8000",
      requiresApiKey: true,
    });
    let fetchCalled = false;
    const originalFetch = global.fetch;
    global.fetch = (async () => {
      fetchCalled = true;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    try {
      const models = await adapter.listModels(makeProfile());
      expect(models).toEqual([]);
      expect(fetchCalled).toBe(false);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("fetches when requiresApiKey=true and an API key is provided", async () => {
    const adapter = new OpenAICompatibleAdapter({
      id: "needs-key",
      defaultBaseUrl: "http://localhost:8000",
      requiresApiKey: true,
    });
    const originalFetch = global.fetch;
    global.fetch = (async () =>
      new Response(JSON.stringify({ data: [{ id: "m1" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;
    try {
      const models = await adapter.listModels(makeProfile(), { apiKey: "sk-test" });
      expect(models).toHaveLength(1);
      expect(models[0].id).toBe("m1");
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe("OpenAICompatibleAdapter chunk shape guard", () => {
  async function streamWith(body: string) {
    const originalFetch = global.fetch;
    global.fetch = (async () =>
      new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } })) as typeof fetch;
    const events = [];
    try {
      for await (const event of makeAdapter().generate(request, makeProfile("http://localhost:8000"), { apiKey: "k" })) {
        events.push(event);
      }
    } finally {
      global.fetch = originalFetch;
    }
    return events;
  }

  it("surfaces an observable error for an object chunk with no choices/usage/model", async () => {
    const events = await streamWith('data: {"unexpected":"shape"}\n\n');
    expect(events.some((e) => e.type === "error")).toBe(true);
    expect(events.some((e) => e.type === "token")).toBe(false);
  });

  it("surfaces an inline HTTP-200 error chunk (e.g. context length) as an observable error", async () => {
    const events = await streamWith('data: {"error":{"message":"context length exceeded"}}\n\n');
    expect(events.some((e) => e.type === "error" && /context length/.test(String(e.message)))).toBe(true);
  });
});
