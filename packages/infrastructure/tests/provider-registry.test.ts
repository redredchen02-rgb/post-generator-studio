import { describe, expect, it } from "vitest";
import { getProviderAdapter, listProviderAdapters } from "@postgen/infrastructure/providers/registry";

describe("provider registry", () => {
  it("registers required providers behind one adapter interface", () => {
    const kinds = listProviderAdapters().map((entry) => entry.kind);

    expect(kinds).toEqual(
      expect.arrayContaining(["openai", "anthropic", "gemini", "ollama", "openrouter", "openai-compatible"]),
    );
    expect(getProviderAdapter("openai-compatible").capabilities().supportsStreaming).toBe(true);
  });
});

