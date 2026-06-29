import { z } from "zod";

/**
 * Pipeline step identifiers — single source of truth.
 * Replaces magic strings spread across schema defaults, registry, service, and UI.
 */
export const PIPELINE_STEPS = {
  BUILD_CONTEXT: "build-context",
  RENDER_PROMPT: "render-prompt",
  // Request-level controls (tone/length/audience/instruction). Runs after
  // RENDER_PROMPT and is preset-toggled like every other step (no-ops when no
  // controls are set), so it belongs in ALL_PIPELINE_STEPS / the registry.
  APPLY_CONTROLS: "apply-controls",
  CLEAN_CONTENT: "clean-content",
  FORMAT_OUTPUT: "format-output",
} as const;

export type PipelineStepId = (typeof PIPELINE_STEPS)[keyof typeof PIPELINE_STEPS];

/** All pipeline step IDs as an array (order matters — it's the execution order). */
export const ALL_PIPELINE_STEPS: readonly PipelineStepId[] = [
  PIPELINE_STEPS.BUILD_CONTEXT,
  PIPELINE_STEPS.RENDER_PROMPT,
  PIPELINE_STEPS.APPLY_CONTROLS,
  PIPELINE_STEPS.CLEAN_CONTENT,
  PIPELINE_STEPS.FORMAT_OUTPUT,
];

/** Default set of enabled steps used in new presets. */
export const DEFAULT_ENABLED_STEPS: readonly PipelineStepId[] = ALL_PIPELINE_STEPS;

/**
 * Zod enum over the known step IDs. Use on the WRITE path (preset create/update)
 * to reject typo'd / unknown steps. Do NOT put this on the preset READ schema:
 * a single stored row with a stale id would throw on parse and brick the whole
 * preset list (local-first DBs can't be centrally migrated). The read path tolerates
 * unknown ids and strips them — see generation-preset-repo.ts.
 */
export const pipelineStepIdSchema = z.enum([
  PIPELINE_STEPS.BUILD_CONTEXT,
  PIPELINE_STEPS.RENDER_PROMPT,
  PIPELINE_STEPS.APPLY_CONTROLS,
  PIPELINE_STEPS.CLEAN_CONTENT,
  PIPELINE_STEPS.FORMAT_OUTPUT,
]);

/** Runtime guard: is an arbitrary string a known pipeline step id? */
export function isPipelineStepId(value: string): value is PipelineStepId {
  return (pipelineStepIdSchema.options as readonly string[]).includes(value);
}