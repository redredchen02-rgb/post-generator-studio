import { renderTemplate } from "@/application/prompt/renderer";
import { resolvePromptVariables } from "@/application/prompt/variables";

/**
 * The single authoritative core shared by both prompt-preview paths: the server
 * route (`previewPrompt`, template editing) and the client bridge
 * (`computePromptPreview`, live generator preview). Each path layers its own concern
 * on top — the server resolves a templateId from storage, the client applies request
 * controls — but the variable resolution and system/user rendering live here once.
 */

export type RenderedPromptPair = {
  systemPrompt: string;
  userPrompt: string;
  usedVariables: string[];
};

/** Resolve built-in variables (TITLE, EVENT_SUMMARY, DATE, …) merged with custom overrides. */
export function buildPreviewVariables(input: {
  title: string;
  eventSummary: string;
  locale?: string;
  customVariables?: Record<string, string>;
}): Record<string, string> {
  return {
    ...resolvePromptVariables(
      { title: input.title, eventSummary: input.eventSummary },
      { locale: input.locale ?? "zh-CN" },
    ),
    ...input.customVariables,
  };
}

/** Render the system + user templates against resolved variables. */
export function renderPromptPair(
  systemTemplate: string,
  userTemplate: string,
  variables: Record<string, string>,
): RenderedPromptPair {
  const system = renderTemplate(systemTemplate, variables);
  const user = renderTemplate(userTemplate, variables);
  return {
    systemPrompt: system.content,
    userPrompt: user.content,
    usedVariables: [...new Set([...system.usedVariables, ...user.usedVariables])],
  };
}
