import { z } from "zod";

/**
 * NSFW / cover analysis verdict from the hotspot-sdk sidecar (`POST /content/analyze`).
 *
 * The sidecar returns one verdict for an image and a list (one per key frame) for a
 * video. We deliberately DROP the wire's `path` field: it is the absolute server-side
 * file path of (possibly flagged) media and must never reach the client or our logs.
 *
 * `action_score` comes from a nudenet proxy unless a CLIP `clip_act` model is supplied
 * (not packaged), so it is a rough signal — the UI labels it accordingly.
 */
export const contentVerdictSchema = z
  .object({
    nsfw_score: z.number(),
    action_score: z.number(),
    sharp_score: z.number(),
    labels: z.record(z.string(), z.number()),
    meta: z.record(z.string(), z.unknown()).optional(),
  })
  .transform((v) => ({
    nsfwScore: v.nsfw_score,
    actionScore: v.action_score,
    sharpScore: v.sharp_score,
    labels: v.labels,
  }));

export type ContentVerdict = z.infer<typeof contentVerdictSchema>;

/** Result surfaced to the client: the analyzed kind plus one-or-more frame verdicts. */
export type ContentAnalysis = {
  kind: "image" | "video";
  verdicts: ContentVerdict[];
};
