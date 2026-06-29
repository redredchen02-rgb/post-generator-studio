import type { PipelineStep } from "@/domain/ports/pipeline";
import { PIPELINE_STEPS } from "@/domain/pipeline-steps";
import { cleanGeneratedContent, formatOutput } from "@/application/content/cleaner";
import { renderTemplate } from "@/application/prompt/renderer";
import { resolvePromptVariables } from "@/application/prompt/variables";
import { applyControlsToPrompts } from "@/application/prompt/controls";
import type { GenerationRequest, NormalizedGenerationRequest } from "@/domain/schemas";

export type ContextPayload = {
  request: GenerationRequest;
  variables: Record<string, string>;
};

export type RenderedPromptPayload = {
  request: GenerationRequest;
  systemPrompt: string;
  userPrompt: string;
  normalizedRequest: NormalizedGenerationRequest;
};

export const buildContextStep: PipelineStep<GenerationRequest, ContextPayload> = {
  id: PIPELINE_STEPS.BUILD_CONTEXT,
  name: "Build Context",
  async execute(context, input) {
    return {
      request: input,
      variables: { ...resolvePromptVariables(input, context.preset), ...input.customVariables },
    };
  },
};

export const renderPromptStep: PipelineStep<ContextPayload, RenderedPromptPayload> = {
  id: PIPELINE_STEPS.RENDER_PROMPT,
  name: "Render Prompt",
  async execute(context, input) {
    const systemPrompt = renderTemplate(context.template.systemPrompt, input.variables).content;
    const userPrompt = renderTemplate(context.template.userPromptTemplate, input.variables).content;
    return {
      request: input.request,
      systemPrompt,
      userPrompt,
      normalizedRequest: {
        systemPrompt,
        userPrompt,
        model: context.providerProfile.model,
        temperature: context.preset.temperature ?? context.providerProfile.defaultTemperature,
        maxTokens: context.preset.maxTokens ?? context.providerProfile.defaultMaxTokens,
        stream: true,
      },
    };
  },
};

/**
 * Apply request-level controls (tone/length/audience/instruction) to the rendered
 * prompt. No-ops when no controls are set, so it's safe to run unconditionally.
 */
export const applyControlsStep: PipelineStep<RenderedPromptPayload, RenderedPromptPayload> = {
  id: PIPELINE_STEPS.APPLY_CONTROLS,
  name: "Apply Controls",
  async execute(_context, input) {
    const adjusted = applyControlsToPrompts(
      { systemPrompt: input.systemPrompt, userPrompt: input.userPrompt, maxTokens: input.normalizedRequest.maxTokens },
      input.request,
    );
    return {
      request: input.request,
      systemPrompt: adjusted.systemPrompt,
      userPrompt: adjusted.userPrompt,
      normalizedRequest: {
        ...input.normalizedRequest,
        systemPrompt: adjusted.systemPrompt,
        userPrompt: adjusted.userPrompt,
        maxTokens: adjusted.maxTokens ?? input.normalizedRequest.maxTokens,
      },
    };
  },
};

export const cleanContentStep: PipelineStep<{ content: string; title: string }, string> = {
  id: PIPELINE_STEPS.CLEAN_CONTENT,
  name: "Clean Content",
  async execute(_context, input) {
    return cleanGeneratedContent(input.content, input.title);
  },
};

export const formatOutputStep: PipelineStep<string, string> = {
  id: PIPELINE_STEPS.FORMAT_OUTPUT,
  name: "Format Output",
  async execute(context, input) {
    return formatOutput(input, context.preset.outputFormat);
  },
};

const steps = [
  buildContextStep,
  renderPromptStep,
  applyControlsStep,
  cleanContentStep,
  formatOutputStep,
];

export function listPipelineSteps(): PipelineStep[] {
  return steps;
}

export function getPipelineStep(id: string): PipelineStep | undefined {
  return steps.find((step) => step.id === id);
}

