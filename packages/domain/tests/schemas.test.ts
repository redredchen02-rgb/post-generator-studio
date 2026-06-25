import { describe, expect, it } from "vitest";
import {
  generationEventSchema,
  generationListQuerySchema,
  generationPresetCreateSchema,
  generationRequestSchema,
  promptPreviewRequestSchema,
  promptTemplateCreateSchema,
  providerProfileCreateSchema,
  providerProfileUpdateSchema,
} from "@postgen/domain";

describe("domain schemas", () => {
  it("validates provider profiles", () => {
    const profile = providerProfileCreateSchema.parse({
      name: "Local",
      providerKind: "ollama",
      baseUrl: "http://localhost:11434",
      model: "llama3.1",
      defaultTemperature: 0.7,
      defaultMaxTokens: 3000,
      enabled: true,
    });

    expect(profile.providerKind).toBe("ollama");
  });

  it("rejects unsafe model parameters", () => {
    expect(() =>
      generationPresetCreateSchema.parse({
        name: "Bad",
        providerProfileId: "provider",
        promptTemplateId: "template",
        temperature: 9,
        maxTokens: 3000,
      }),
    ).toThrow();
  });

  it("generationListQuerySchema supports search and offset", () => {
    const result = generationListQuerySchema.parse({ limit: 10, offset: 5, search: "hello" });
    expect(result.limit).toBe(10);
    expect(result.offset).toBe(5);
    expect(result.search).toBe("hello");

    const defaults = generationListQuerySchema.parse({ limit: 10 });
    expect(defaults.offset).toBe(0);
    expect(defaults.search).toBeUndefined();
  });

  it("generationRequestSchema accepts and rejects customVariables", () => {
    const req = generationRequestSchema.parse({
      title: "Test",
      eventSummary: "Summary",
      presetId: "p1",
      customVariables: { PLATFORM: "微信" },
    });
    expect(req.customVariables).toEqual({ PLATFORM: "微信" });

    expect(() =>
      generationRequestSchema.parse({
        title: "Test",
        eventSummary: "Summary",
        presetId: "p1",
        customVariables: { PLATFORM: "{{bad}}" },
      }),
    ).toThrow("cannot contain");
  });

  it("promptPreviewRequestSchema accepts customVariables", () => {
    const result = promptPreviewRequestSchema.parse({
      customVariables: { FOO: "bar" },
    });
    expect(result.customVariables).toEqual({ FOO: "bar" });
  });

  it("providerProfileUpdateSchema clearApiKey (R22)", () => {
    const clear = providerProfileUpdateSchema.parse({ clearApiKey: true });
    expect(clear.clearApiKey).toBe(true);

    const noOp = providerProfileUpdateSchema.parse({ clearApiKey: false });
    expect(noOp.clearApiKey).toBe(false);

    const omitted = providerProfileUpdateSchema.parse({ name: "test" });
    expect(omitted.clearApiKey).toBeUndefined();
  });

  it("validates prompt templates and generation events", () => {
    expect(
      promptTemplateCreateSchema.parse({
        name: "News",
        systemPrompt: "Rules",
        userPromptTemplate: "{{TITLE}}",
      }).supportedVariables,
    ).toContain("TITLE");

    expect(generationEventSchema.parse({ type: "token", value: "hello" })).toEqual({
      type: "token",
      value: "hello",
    });
  });
});

