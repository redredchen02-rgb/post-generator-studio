import { z } from "zod";

/**
 * Local, vocabulary-driven copy score from the hotspot-sdk sidecar (`POST /score`).
 * A fast, deterministic, offline complement to the LLM-as-Judge: it rewards
 * trending hooks / openers / CTA and penalizes "AI slop", surfacing every signal
 * in `breakdown` so the UI can show *why* and the host can re-weight downstream.
 *
 * Mirrors `hotspot_sdk.adapters.ScoreResult`. The score is unbounded (sum of
 * per-signal weights, can be negative when AI-slop penalties dominate), so it is
 * shown as a relative reference, not an absolute 0-100 grade.
 */
export const localScoreSchema = z.object({
  text: z.string(),
  score: z.number(),
  breakdown: z.record(z.string(), z.number()),
  flags: z.array(z.string()),
});

export type LocalScore = z.infer<typeof localScoreSchema>;

/** Body for the stateless draft-scoring route `POST /api/score`. */
export const draftScoreRequestSchema = z.object({
  // Cap length: debounce is a UX nicety, not a rate limit — the route is callable
  // directly, so the size bound lives here, not in the client.
  text: z.string().max(20_000),
});

export type DraftScoreRequest = z.infer<typeof draftScoreRequestSchema>;
