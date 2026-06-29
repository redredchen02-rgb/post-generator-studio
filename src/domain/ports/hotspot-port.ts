import type { LocalScore } from "@/domain/schemas";

/**
 * Health snapshot of the hotspot-sdk sidecar, surfaced to the UI for degradation.
 * `capabilities` mirrors the sidecar's `/health` — `content` is false when the
 * `[content]` extra (nudenet/opencv) is not installed.
 */
export type HotspotSidecarHealth = {
  ok: boolean;
  version: string;
  capabilities: {
    scoring: boolean;
    hotspot: boolean;
    content: boolean;
    telegram: boolean;
  };
};

export type HotspotOptions = {
  abortSignal?: AbortSignal;
};

/**
 * Contract for the hotspot-sdk capabilities. The infrastructure adapter implements
 * this as a thin HTTP client to the FastAPI sidecar. Convention-aligned with
 * WatermarkPort; not a replaceability seam (one implementation only).
 */
export interface ScoringPort {
  health(options?: HotspotOptions): Promise<HotspotSidecarHealth>;

  /** Vocabulary-driven copy score (`POST /score`). Pure; should return sub-second. */
  score(text: string, options?: HotspotOptions): Promise<LocalScore>;
}
