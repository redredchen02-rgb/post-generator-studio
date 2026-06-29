import type { ScoringPort } from "@/domain/ports/hotspot-port";
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

/** Test seam: swap the adapter (mirrors setWatermarkAdapter). */
export function setHotspotAdapter(adapter: HotspotAdapter | undefined): void {
  cached = adapter;
}
