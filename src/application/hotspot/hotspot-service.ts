import type { HotspotAlert } from "@/domain/schemas";
import { getHotspotAdapter } from "@/infrastructure/hotspot";

/**
 * Hotspot ranking: submit a leaderboard snapshot and get jump/drop/new-entry alerts.
 * Thin pass-through to the sidecar — the ranker holds the (single, per-process)
 * baseline, so the first snapshot returns no alerts. See the plan's Unit 5 for the
 * shared-state caveat.
 */
export function submitSnapshot(
  ranking: Record<string, number>,
  signal?: AbortSignal,
): Promise<HotspotAlert[]> {
  return getHotspotAdapter().processSnapshot(ranking, { abortSignal: signal });
}
