/**
 * Client-side prompt preview for the live generator.
 *
 * Shares its variable-resolution + system/user rendering with the server route via
 * `@/application/prompt/preview-core` (single source of truth); this path adds the
 * request-level controls on top. All imports are pure functions safe in the browser.
 */
// eslint-disable-next-line import/no-restricted-paths -- presentation/lib/ is the sanctioned bridge layer for application imports
import { extractTemplateVariables } from "@/application/prompt/renderer";
// eslint-disable-next-line import/no-restricted-paths -- bridge (see above)
import { buildPreviewVariables, renderPromptPair } from "@/application/prompt/preview-core";
// eslint-disable-next-line import/no-restricted-paths -- bridge (see above)
import { applyControlsToPrompts } from "@/application/prompt/controls";
import type { GenerationControls, PromptTemplate } from "@/domain/schemas";

export type PromptPreviewInput = {
  template?: PromptTemplate;
  title: string;
  eventSummary: string;
  locale?: string;
  customVariables?: Record<string, string>;
  controls?: GenerationControls;
};

export type PromptPreviewResult = {
  systemPrompt: string;
  userPrompt: string;
  usedVariables: string[];
};

export function computePromptPreview(input: PromptPreviewInput): PromptPreviewResult {
  const variables = buildPreviewVariables({
    title: input.title,
    eventSummary: input.eventSummary,
    locale: input.locale,
    customVariables: input.customVariables,
  });

  if (!input.template) {
    return { systemPrompt: "", userPrompt: "", usedVariables: [] };
  }

  const rendered = renderPromptPair(input.template.systemPrompt, input.template.userPromptTemplate, variables);

  const controlled = applyControlsToPrompts(
    { systemPrompt: rendered.systemPrompt, userPrompt: rendered.userPrompt },
    input.controls ?? {},
  );

  return {
    systemPrompt: controlled.systemPrompt,
    userPrompt: controlled.userPrompt,
    usedVariables: rendered.usedVariables,
  };
}

export { extractTemplateVariables };