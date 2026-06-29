import type { AppError, Generation, GenerationControls } from "@/domain/schemas";

/**
 * Shared wire contract for the `/api/generations` SSE stream, used by both the
 * single-editor stream hook and the multi-variant hook. The low-level line parsing
 * is shared via `@/lib/sse` (parseSSEStream); this module dedupes the parsed payload
 * shape and the request-body construction. Token buffering stays per-hook on purpose:
 * the single editor flushes one string via rAF, while variants flush a per-index Map
 * via an interval — different enough that a shared buffer would leak.
 */
export type GenerationStreamPayload =
  | { type: "generation"; generation: Generation }
  | { type: "token"; value: string }
  | { type: "metadata"; model?: string; inputTokens?: number; outputTokens?: number }
  | { type: "complete" }
  | { type: "error"; message?: string; error?: AppError; retryable?: boolean }
  | { type: "final"; generation: Generation; content: string };

export type GenerationRequestParams = {
  title: string;
  eventSummary: string;
  presetId: string;
  providerProfileId?: string;
  /** Caller-controlled: a fresh UUID for new/variant runs, undefined to bypass idempotency on regenerate. */
  idempotencyKey?: string;
  customVariables?: Record<string, string>;
  controls?: GenerationControls;
};

/** Build the POST body for `/api/generations`, normalizing empty optionals to undefined. */
export function buildGenerationRequestBody(params: GenerationRequestParams) {
  const { title, eventSummary, presetId, providerProfileId, idempotencyKey, customVariables, controls } = params;
  return {
    title,
    eventSummary,
    presetId,
    providerProfileId: providerProfileId || undefined,
    idempotencyKey,
    customVariables: customVariables && Object.keys(customVariables).length > 0 ? customVariables : undefined,
    ...controls,
  };
}
