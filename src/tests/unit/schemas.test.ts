import { describe, expect, it } from "vitest";
import {
  generationEventSchema,
  generationPresetCreateSchema,
  generationRequestSchema,
  promptTemplateCreateSchema,
  providerProfileCreateSchema,
  providerKindSchema,
} from "@/domain/schemas";

describe("domain schemas", () => {
  it("validates provider profiles", () => {
    const profile = providerProfileCreateSchema.parse({
      name: "Local",
      providerKind: "openai-compatible",
      baseUrl: "http://localhost:8000",
      model: "local-model",
      defaultTemperature: 0.7,
      defaultMaxTokens: 3000,
      enabled: true,
    });

    expect(profile.providerKind).toBe("openai-compatible");
  });

  it("rejects the removed ollama provider kind", () => {
    expect(() => providerKindSchema.parse("ollama")).toThrow();
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

  it("accepts request-level generation controls", () => {
    const req = generationRequestSchema.parse({
      title: "T",
      eventSummary: "S",
      presetId: "preset_1",
      tone: "casual",
      lengthTarget: "short",
      audience: "学生",
      customInstruction: "多用短句",
    });
    expect(req.tone).toBe("casual");
    expect(req.lengthTarget).toBe("short");
  });

  it("rejects an unknown tone", () => {
    expect(() =>
      generationRequestSchema.parse({ title: "T", eventSummary: "S", presetId: "p", tone: "sarcastic" }),
    ).toThrow();
  });

  it("accepts grok as a valid providerKind", () => {
    expect(providerKindSchema.parse("grok")).toBe("grok");
  });

  it("rejects unknown provider kind alias xai", () => {
    expect(() => providerKindSchema.parse("xai")).toThrow();
  });
});

