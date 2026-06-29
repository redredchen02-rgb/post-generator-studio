import type { ContentPort, HotspotPort, ScoringPort } from "@/domain/ports/hotspot-port";
import { HotspotAdapter } from "@/infrastructure/hotspot/hotspot-adapter";

let cached: HotspotAdapter | undefined;

/** Single instance — one implementation fronting the whole sidecar, no dispatch. */
export function getHotspotAdapter(): HotspotAdapter {
  if (!cached) cached = new HotspotAdapter();
  return cached;
}

/** Narrowed accessor for the scoring capability. */
export function getScoringAdapter(): ScoringPort {
  return getHotspotAdapter();
}

/** Narrowed accessor for the hotspot-ranking capability. */
export function getRankingAdapter(): HotspotPort {
  return getHotspotAdapter();
}

/** Narrowed accessor for the content-analysis capability. */
export function getContentAdapter(): ContentPort {
  return getHotspotAdapter();
}

/** Test seam: swap the adapter (mirrors setWatermarkAdapter). */
export function setHotspotAdapter(adapter: HotspotAdapter | undefined): void {
  cached = adapter;
}
