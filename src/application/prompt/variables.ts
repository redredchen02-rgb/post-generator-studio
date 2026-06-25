import type { GenerationRequest, GenerationPreset } from "@/domain/schemas";

export type PromptVariables = Record<string, string>;

function formatDate(locale: string, date: Date): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatTime(locale: string, date: Date): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function resolvePromptVariables(
  request: Pick<GenerationRequest, "title" | "eventSummary">,
  preset: Pick<GenerationPreset, "locale">,
  date = new Date(),
): PromptVariables {
  return {
    TITLE: request.title,
    EVENT_SUMMARY: request.eventSummary,
    DATE: formatDate(preset.locale, date),
    TIME: formatTime(preset.locale, date),
    LOCALE: preset.locale,
  };
}

