/**
 * Client-side prompt preview.
 *
 * Replaces the previous server-side `/api/prompt-templates/preview` call.
 * Both `renderTemplate` and `resolvePromptVariables` are pure functions
 * with no Node.js dependencies — safe to run in the browser.
 */
import { renderTemplate, extractTemplateVariables } from "@/application/prompt/renderer";
import { resolvePromptVariables } from "@/application/prompt/variables";
import type { PromptTemplate } from "@/domain/schemas";

export type PromptPreviewInput = {
  template?: PromptTemplate;
  title: string;
  eventSummary: string;
  locale?: string;
  customVariables?: Record<string, string>;
};

export type PromptPreviewResult = {
  systemPrompt: string;
  userPrompt: string;
  usedVariables: string[];
};

export function computePromptPreview(input: PromptPreviewInput): PromptPreviewResult {
  const variables = {
    ...resolvePromptVariables(
      { title: input.title, eventSummary: input.eventSummary },
      { locale: input.locale ?? "zh-CN" },
    ),
    ...input.customVariables,
  };

  if (!input.template) {
    return { systemPrompt: "", userPrompt: "", usedVariables: [] };
  }

  const systemResult = renderTemplate(input.template.systemPrompt, variables);
  const userResult = renderTemplate(input.template.userPromptTemplate, variables);

  return {
    systemPrompt: systemResult.content,
    userPrompt: userResult.content,
    usedVariables: [...new Set([...systemResult.usedVariables, ...userResult.usedVariables])],
  };
}

export { extractTemplateVariables };