import { PIPELINE_STEPS } from "@/domain/pipeline-steps";
import type { PipelineStep } from "@/domain/ports/pipeline";
import { cleanGeneratedContent, formatOutput } from "@/application/content/cleaner";
import { renderTemplate } from "@/application/prompt/renderer";
import { resolvePromptVariables } from "@/application/prompt/variables";
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
  id: "build-context",
  name: "Build Context",
  async execute(context, input) {
    return {
      request: input,
      variables: { ...resolvePromptVariables(input, context.preset), ...input.customVariables },
    };
  },
};

export const renderPromptStep: PipelineStep<ContextPayload, RenderedPromptPayload> = {
  id: "render-prompt",
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

export const cleanContentStep: PipelineStep<{ content: string; title: string }, string> = {
  id: "clean-content",
  name: "Clean Content",
  async execute(_context, input) {
    return cleanGeneratedContent(input.content, input.title);
  },
};

export const formatOutputStep: PipelineStep<string, string> = {
  id: "format-output",
  name: "Format Output",
  async execute(context, input) {
    return formatOutput(input, context.preset.outputFormat);
  },
};

const steps = [
  buildContextStep,
  renderPromptStep,
  cleanContentStep,
  formatOutputStep,
];

export function listPipelineSteps(): PipelineStep[] {
  return steps;
}

export function getPipelineStep(id: string): PipelineStep | undefined {
  return steps.find((step) => step.id === id);
}

