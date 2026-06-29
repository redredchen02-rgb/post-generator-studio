import { describe, expect, it } from "vitest";
import { buildRenderedPrompt, postProcessContent } from "@/plugins/pipeline/execute";
import { cleanGeneratedContent, formatOutput } from "@/application/content/cleaner";
import { PIPELINE_STEPS } from "@/domain/pipeline-steps";
import type { PipelineContext } from "@/domain/ports/pipeline";
import type { GenerationRequest, PromptTemplate } from "@/domain/schemas";
import { createTestPreset, createTestProvider } from "../fixtures";

const noopLogger = { info() {}, warn() {}, error() {} };

function makeTemplate(): PromptTemplate {
  return {
    id: "template_test",
    name: "Test",
    systemPrompt: "You write about {{TITLE}}.",
    userPromptTemplate: "Title: {{TITLE}}\nSummary: {{EVENT_SUMMARY}}",
    supportedVariables: ["TITLE", "EVENT_SUMMARY"],
    customVariableDefaults: {},
    outputFormat: "markdown",
    version: 1,
    isDefault: true,
    createdAt: "2026-06-29T00:00:00.000Z",
    updatedAt: "2026-06-29T00:00:00.000Z",
  };
}

function makeContext(presetOverrides = {}): PipelineContext {
  return {
    generationId: "gen_test",
    preset: createTestPreset(presetOverrides),
    providerProfile: createTestProvider(),
    template: makeTemplate(),
    logger: noopLogger,
    abortSignal: new AbortController().signal,
  };
}

const request: GenerationRequest = {
  title: "AI startup sprint",
  eventSummary: "- day 1\n- day 2",
  presetId: "preset_test",
};

const ALL = new Set<string>([
  PIPELINE_STEPS.BUILD_CONTEXT,
  PIPELINE_STEPS.RENDER_PROMPT,
  PIPELINE_STEPS.APPLY_CONTROLS,
  PIPELINE_STEPS.CLEAN_CONTENT,
  PIPELINE_STEPS.FORMAT_OUTPUT,
]);

describe("postProcessContent — gating parity (the subtle traps)", () => {
  const ctx = makeContext({ outputFormat: "markdown" });
  const raw = "# Title\n\n  messy   draft  \n\n\n";
  const title = "Title";

  it("both off → returns the raw content untouched", async () => {
    const out = await postProcessContent(ctx, raw, title, new Set());
    expect(out).toBe(raw);
  });

  it("clean + format on → format(clean(raw))", async () => {
    const out = await postProcessContent(ctx, raw, title, new Set([PIPELINE_STEPS.CLEAN_CONTENT, PIPELINE_STEPS.FORMAT_OUTPUT]));
    expect(out).toBe(formatOutput(cleanGeneratedContent(raw, title), ctx.preset.outputFormat));
  });

  it("clean on, format off → clean(raw) only", async () => {
    const out = await postProcessContent(ctx, raw, title, new Set([PIPELINE_STEPS.CLEAN_CONTENT]));
    expect(out).toBe(cleanGeneratedContent(raw, title));
  });

  it("clean OFF, format on → format(raw) on UNCLEANED content (trap)", async () => {
    const out = await postProcessContent(ctx, raw, title, new Set([PIPELINE_STEPS.FORMAT_OUTPUT]));
    expect(out).toBe(formatOutput(raw, ctx.preset.outputFormat));
  });
});

describe("buildRenderedPrompt — pre-stream assembly", () => {
  it("all steps enabled → renders prompts from the template", async () => {
    const ctx = makeContext();
    const rendered = await buildRenderedPrompt(ctx, request, ALL);
    expect(rendered.systemPrompt).toContain("AI startup sprint");
    expect(rendered.userPrompt).toContain("day 1");
    expect(rendered.normalizedRequest.model).toBe(ctx.providerProfile.model);
    expect(rendered.normalizedRequest.stream).toBe(true);
  });

  it("render-prompt disabled → fallback empty prompts + provider/preset defaults", async () => {
    const ctx = makeContext({ temperature: 0.42, maxTokens: 1234 });
    const rendered = await buildRenderedPrompt(ctx, request, new Set([PIPELINE_STEPS.BUILD_CONTEXT]));
    expect(rendered.systemPrompt).toBe("");
    expect(rendered.userPrompt).toBe("");
    expect(rendered.normalizedRequest.model).toBe(ctx.providerProfile.model);
    expect(rendered.normalizedRequest.temperature).toBe(0.42);
    expect(rendered.normalizedRequest.maxTokens).toBe(1234);
  });

  it("temperature/maxTokens fall back to provider defaults when preset omits them", async () => {
    const ctx = makeContext({ temperature: undefined, maxTokens: undefined });
    const rendered = await buildRenderedPrompt(ctx, request, new Set());
    expect(rendered.normalizedRequest.temperature).toBe(ctx.providerProfile.defaultTemperature);
    expect(rendered.normalizedRequest.maxTokens).toBe(ctx.providerProfile.defaultMaxTokens);
  });
});
