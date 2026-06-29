import { describe, expect, it } from "vitest";
import { getProviderAdapter, listProviderAdapters } from "@/infrastructure/providers/registry";

describe("provider registry", () => {
  it("registers required providers behind one adapter interface", () => {
    const kinds = listProviderAdapters().map((entry) => entry.kind);

    expect(kinds).toEqual(
      expect.arrayContaining(["openai", "anthropic", "gemini", "openrouter", "openai-compatible", "grok"]),
    );
    expect(kinds).not.toContain("ollama");
    expect(getProviderAdapter("openai-compatible").capabilities().supportsStreaming).toBe(true);
  });
});

