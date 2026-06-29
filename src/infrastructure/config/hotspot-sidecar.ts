/** Config for reaching the hotspot-sdk FastAPI sidecar (scoring + hotspot + content). */

import { timeoutMsFromEnv } from "@/infrastructure/http/with-timeout";

const DEFAULT_SIDECAR_URL = "http://127.0.0.1:8770";
// Scoring + snapshot are pure functions — they should return in well under a second.
const DEFAULT_SCORING_TIMEOUT_MS = 10_000;
// Image NSFW runs a model; video adds scenedetect + per-frame inference and is far slower.
const DEFAULT_IMAGE_TIMEOUT_MS = 60_000;
const DEFAULT_VIDEO_TIMEOUT_MS = 600_000;

export function getHotspotSidecarUrl(): string {
  return (process.env.HOTSPOT_SIDECAR_URL || DEFAULT_SIDECAR_URL).replace(/\/$/, "");
}

/** Process-to-process shared secret; sent as x-api-key when set (matches sidecar's HOTSPOT_API_KEY). */
export function getHotspotSidecarSecret(): string | undefined {
  return process.env.HOTSPOT_SIDECAR_SECRET || undefined;
}

export function getScoringTimeoutMs(): number {
  return timeoutMsFromEnv("HOTSPOT_SCORING_TIMEOUT_MS", DEFAULT_SCORING_TIMEOUT_MS);
}

export function getContentImageTimeoutMs(): number {
  return timeoutMsFromEnv("HOTSPOT_IMAGE_TIMEOUT_MS", DEFAULT_IMAGE_TIMEOUT_MS);
}

export function getContentVideoTimeoutMs(): number {
  return timeoutMsFromEnv("HOTSPOT_VIDEO_TIMEOUT_MS", DEFAULT_VIDEO_TIMEOUT_MS);
}
