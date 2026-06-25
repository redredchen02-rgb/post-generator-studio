import { describe, expect, it } from "vitest";
import {
  generationEventSchema,
  generationPresetCreateSchema,
  promptTemplateCreateSchema,
  providerProfileCreateSchema,
} from "@/domain/schemas";

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

