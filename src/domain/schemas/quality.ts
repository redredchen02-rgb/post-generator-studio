import { z } from "zod";

/**
 * LLM-as-Judge quality scoring (Unit 9). Five fixed dimensions, each scored 1-5
 * with a one-sentence justification. The `overall` is computed in code (mean of
 * the five), never trusted from the model — one less noise source than asking
 * the judge to average. See docs/optimization/generator-quality-spec.md.
 */

export const QUALITY_DIMENSIONS = [
  "relevance",
  "coherence",
  "factuality",
  "style",
  "completeness",
] as const;
export type QualityDimension = (typeof QUALITY_DIMENSIONS)[number];

const dimensionScoreSchema = z.object({
  score: z.number().int().min(1).max(5),
  justification: z.string().min(1),
});
export type DimensionScore = z.infer<typeof dimensionScoreSchema>;

/** Exactly what the judge model is asked to return — the five dimensions only. */
export const judgeReplySchema = z.object({
  relevance: dimensionScoreSchema,
  coherence: dimensionScoreSchema,
  factuality: dimensionScoreSchema,
  style: dimensionScoreSchema,
  completeness: dimensionScoreSchema,
});
export type JudgeReply = z.infer<typeof judgeReplySchema>;

/** Persisted score: judge reply + computed overall + provenance for bias mitigation. */
export const qualityScoreSchema = judgeReplySchema.extend({
  overall: z.number().min(1).max(5),
  judgeModel: z.string().optional(),
  /** True when the judge ran on the same model that generated the content (self-enhancement bias — discount accordingly). */
  selfEvaluated: z.boolean(),
  scoredAt: z.string(),
});
export type QualityScore = z.infer<typeof qualityScoreSchema>;

/** Mean of the five dimension scores, rounded to one decimal. */
export function computeOverall(reply: JudgeReply): number {
  const sum = QUALITY_DIMENSIONS.reduce((acc, dim) => acc + reply[dim].score, 0);
  return Math.round((sum / QUALITY_DIMENSIONS.length) * 10) / 10;
}
