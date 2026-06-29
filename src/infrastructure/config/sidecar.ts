/** Config for reaching the omniwm FastAPI sidecar. */

const DEFAULT_SIDECAR_URL = "http://127.0.0.1:8765";
const DEFAULT_IMAGE_TIMEOUT_MS = 60_000;
// Video work (watermark/detect/delogo) runs ffmpeg and is far slower than image.
const DEFAULT_VIDEO_TIMEOUT_MS = 600_000;

export function getSidecarUrl(): string {
  return (process.env.OMNIWM_SIDECAR_URL || DEFAULT_SIDECAR_URL).replace(/\/$/, "");
}

/** Process-to-process shared secret; sent as x-omniwm-secret when set. */
export function getSidecarSecret(): string | undefined {
  return process.env.OMNIWM_SIDECAR_SECRET || undefined;
}

function msFromEnv(envVar: string, def: number): number {
  const raw = process.env[envVar];
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : def;
}

export function getImageTimeoutMs(): number {
  return msFromEnv("OMNIWM_IMAGE_TIMEOUT_MS", DEFAULT_IMAGE_TIMEOUT_MS);
}

export function getVideoTimeoutMs(): number {
  return msFromEnv("OMNIWM_VIDEO_TIMEOUT_MS", DEFAULT_VIDEO_TIMEOUT_MS);
}
