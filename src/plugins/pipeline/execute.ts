import type { PipelineContext } from "@/domain/ports/pipeline";
import type { GenerationRequest } from "@/domain/schemas";
import { PIPELINE_STEPS } from "@/domain/pipeline-steps";
import {
  applyControlsStep,
  buildContextStep,
  cleanContentStep,
  formatOutputStep,
  renderPromptStep,
  type RenderedPromptPayload,
} from "@/plugins/pipeline/registry";

/**
 * Two-stage pipeline execution, separated by the LLM stream that sits between
 * apply-controls and clean-content. These are deliberately NOT a generic "runner":
 * step order is explicit in code (the registry only drives the enabled-gating set,
 * not order) so heterogeneous step I/O stays type-checked. Persistence stays OUT of
 * this module — the caller (generation-service) owns all storage writes, so this file
 * never imports infrastructure.
 */

/**
 * Pre-stream: assemble the rendered prompt + normalized request from the raw request.
 * Each step is gated by `enabled`; disabled steps fall back to the prior payload,
 * preserving the exact behavior of the former inline orchestration.
 */
export async function buildRenderedPrompt(
  context: PipelineContext,
  request: GenerationRequest,
  enabled: Set<string>,
): Promise<RenderedPromptPayload> {
  const { preset, providerProfile: provider } = context;
  const contextPayload = enabled.has(PIPELINE_STEPS.BUILD_CONTEXT)
    ? await buildContextStep.execute(context, request)
    : { request, variables: {} };
  const renderedBase: RenderedPromptPayload = enabled.has(PIPELINE_STEPS.RENDER_PROMPT)
    ? await renderPromptStep.execute(context, contextPayload)
    : {
        request: contextPayload.request,
        systemPrompt: "",
        userPrompt: "",
        normalizedRequest: {
          systemPrompt: "",
          userPrompt: "",
          model: provider.model,
          temperature: preset.temperature ?? provider.defaultTemperature,
          maxTokens: preset.maxTokens ?? provider.defaultMaxTokens,
          stream: true as const,
        },
      };
  // Request-level controls (tone/length/audience/instruction); no-ops when unset.
  return enabled.has(PIPELINE_STEPS.APPLY_CONTROLS)
    ? await applyControlsStep.execute(context, renderedBase)
    : renderedBase;
}

/**
 * Post-stream: clean + format the accumulated model output. Gated like the prompt
 * stage. Only the pre-stream `context` and the raw string are available here — the
 * stream severs the typed payload chain, so future post-steps needing pre-stream data
 * should thread it via PipelineContext, not by widening this signature.
 *
 * Caller contract: run ONLY on the successful `complete` path. The error and cancel
 * branches intentionally keep the raw accumulated content unprocessed.
 */
export async function postProcessContent(
  context: PipelineContext,
  rawContent: string,
  title: string,
  enabled: Set<string>,
): Promise<string> {
  if (enabled.has(PIPELINE_STEPS.CLEAN_CONTENT)) {
    const cleaned = await cleanContentStep.execute(context, { content: rawContent, title });
    return enabled.has(PIPELINE_STEPS.FORMAT_OUTPUT)
      ? await formatOutputStep.execute(context, cleaned)
      : cleaned;
  }
  if (enabled.has(PIPELINE_STEPS.FORMAT_OUTPUT)) {
    return await formatOutputStep.execute(context, rawContent);
  }
  return rawContent;
}
