import { HotspotAdapter } from "@/infrastructure/hotspot/hotspot-adapter";

let cached: HotspotAdapter | undefined;

/**
 * Single instance fronting the whole sidecar (scoring + hotspot + content). One
 * implementation, no dispatch — callers use this directly; the port interfaces
 * (ScoringPort/HotspotPort/ContentPort) are the typed contracts it satisfies.
 */
export function getHotspotAdapter(): HotspotAdapter {
  if (!cached) cached = new HotspotAdapter();
  return cached;
}

/** Test seam: swap the adapter (mirrors setWatermarkAdapter). */
export function setHotspotAdapter(adapter: HotspotAdapter | undefined): void {
  cached = adapter;
}
