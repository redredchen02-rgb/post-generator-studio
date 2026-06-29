import { z } from "zod";

/**
 * Hotspot ranking + alerts (hotspot-sdk sidecar `POST /hotspot/snapshot`).
 *
 * The sidecar's ranker is stateful per process: it diffs each snapshot against the
 * one before it (a single global baseline). The first snapshot only primes the
 * baseline and yields no jump/new alerts. There is no reset endpoint in the vendored
 * server, so mixing leaderboards from different sources will diff across them — the
 * UI must warn about this. Rank is 1-based (1 = top); off-board drops carry rank 0.
 */

export const HOTSPOT_ALERT_KINDS = ["jump", "drop", "new_entry"] as const;
export type HotspotAlertKind = (typeof HOTSPOT_ALERT_KINDS)[number];

/** Wire shape from the sidecar (snake_case), normalized to a camelCase domain alert. */
export const hotspotAlertSchema = z
  .object({
    keyword: z.string(),
    kind: z.enum(HOTSPOT_ALERT_KINDS),
    rank: z.number().int(),
    prev_rank: z.number().int(),
    delta: z.number().int(),
    meta: z.record(z.string(), z.unknown()).optional(),
  })
  .transform((a) => ({
    keyword: a.keyword,
    kind: a.kind,
    rank: a.rank,
    prevRank: a.prev_rank,
    delta: a.delta,
  }));

export type HotspotAlert = z.infer<typeof hotspotAlertSchema>;

export const hotspotAlertsSchema = z.array(hotspotAlertSchema);

/**
 * A leaderboard snapshot: keyword -> 1-based rank. Capped at 500 entries — the route
 * is an unauthenticated local proxy that mutates shared ranker state, so the size
 * bound is a Node-edge guard, not a client convenience.
 */
export const snapshotRequestSchema = z.object({
  // Cap both entry count and per-keyword length: this unauthenticated local route
  // mutates shared ranker state, so an oversized payload (500 × multi-MB keys) is a
  // DoS amplifier without a length bound. Real keywords are short.
  ranking: z.record(z.string().max(200), z.number().int().positive()).refine(
    (r) => Object.keys(r).length <= 500,
    { message: "排行榜条目过多（上限 500）" },
  ),
});

export type SnapshotRequest = z.infer<typeof snapshotRequestSchema>;
