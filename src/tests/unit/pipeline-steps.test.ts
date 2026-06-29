import { describe, expect, it } from "vitest";
import {
  ALL_PIPELINE_STEPS,
  PIPELINE_STEPS,
  isPipelineStepId,
  pipelineStepIdSchema,
} from "@/domain/pipeline-steps";
import { generationPresetCreateSchema, generationPresetSchema } from "@/domain/schemas";
import { listPipelineSteps } from "@/plugins/pipeline/registry";

describe("pipeline step id — single source of truth", () => {
  it("pipelineStepIdSchema accepts every known step", () => {
    for (const id of ALL_PIPELINE_STEPS) {
      expect(pipelineStepIdSchema.parse(id)).toBe(id);
    }
  });

  it("pipelineStepIdSchema rejects an unknown step", () => {
    expect(() => pipelineStepIdSchema.parse("typo-step")).toThrow();
  });

  it("isPipelineStepId narrows known vs unknown", () => {
    expect(isPipelineStepId(PIPELINE_STEPS.BUILD_CONTEXT)).toBe(true);
    expect(isPipelineStepId("generate-content")).toBe(false);
  });

  it("registry step ids never drift from ALL_PIPELINE_STEPS", () => {
    const registryIds = listPipelineSteps().map((s) => s.id).sort();
    expect(registryIds).toEqual([...ALL_PIPELINE_STEPS].sort());
  });
});

describe("enabledPipelineSteps — write strict / read tolerant", () => {
  it("WRITE: create schema rejects an unknown step (no new bad data)", () => {
    expect(() =>
      generationPresetCreateSchema.parse({
        name: "x",
        providerProfileId: "p",
        promptTemplateId: "t",
        enabledPipelineSteps: ["build-context", "typo-step"],
      }),
    ).toThrow();
  });

  it("WRITE: create schema accepts a valid subset and defaults when omitted", () => {
    const parsed = generationPresetCreateSchema.parse({
      name: "x",
      providerProfileId: "p",
      promptTemplateId: "t",
    });
    expect(parsed.enabledPipelineSteps).toEqual([...ALL_PIPELINE_STEPS]);
  });

  it("READ: preset schema TOLERATES an unknown step (never throws → no brick)", () => {
    const row = {
      id: "preset_1",
      name: "x",
      providerProfileId: "p",
      promptTemplateId: "t",
      locale: "zh-CN",
      outputFormat: "markdown" as const,
      enabledPipelineSteps: ["build-context", "typo-step", "render-prompt"],
      isDefault: false,
      createdAt: "2026-06-29T00:00:00.000Z",
      updatedAt: "2026-06-29T00:00:00.000Z",
    };
    expect(() => generationPresetSchema.parse(row)).not.toThrow();
  });

  it("READ: empty enabled set is valid (all steps disabled)", () => {
    const parsed = generationPresetSchema.parse({
      id: "preset_2",
      name: "x",
      providerProfileId: "p",
      promptTemplateId: "t",
      locale: "zh-CN",
      outputFormat: "markdown",
      enabledPipelineSteps: [],
      isDefault: false,
      createdAt: "2026-06-29T00:00:00.000Z",
      updatedAt: "2026-06-29T00:00:00.000Z",
    });
    expect(parsed.enabledPipelineSteps).toEqual([]);
  });
});
