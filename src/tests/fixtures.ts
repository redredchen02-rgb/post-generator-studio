import { vi } from "vitest";
import type { ProviderProfile, GenerationPreset } from "@/domain/schemas";

let fixtureCounter = 0;

function fixtureId(prefix: string): string {
  fixtureCounter++;
  return `${prefix}_test_${fixtureCounter}`;
}

export function createTestProvider(overrides?: Partial<ProviderProfile>): ProviderProfile {
  return {
    id: fixtureId("provider"),
    name: `Test Provider ${fixtureCounter}`,
    providerKind: "openai-compatible",
    baseUrl: "http://fixture.local",
    model: "fixture-model",
    apiKeyRef: undefined,
    keyMasked: undefined,
    defaultTemperature: 0.7,
    defaultMaxTokens: 3000,
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createTestPreset(overrides?: Partial<GenerationPreset>): GenerationPreset {
  return {
    id: fixtureId("preset"),
    name: `Test Preset ${fixtureCounter}`,
    providerProfileId: "provider_test_1",
    promptTemplateId: "template_news_writing",
    temperature: 0.7,
    maxTokens: 3000,
    locale: "zh-CN",
    outputFormat: "markdown",
    enabledPipelineSteps: ["build-context", "render-prompt", "apply-controls", "clean-content", "format-output"],
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function mockFetchSSE(chunks: string[]) {
  const sseBody = chunks.join("\n\n") + "\n\n";
  return vi.spyOn(global, "fetch").mockResolvedValue(
    new Response(sseBody, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }),
  );
}

export function mockFetchError(status: number, message: string) {
  return vi.spyOn(global, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ error: { message } }), { status }),
  );
}
