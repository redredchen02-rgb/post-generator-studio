/**
 * Next.js startup hook. Runs once when the server boots (nodejs runtime only).
 * Used to reap orphaned watermark job dirs left by SIGKILL/crashes or detect
 * sessions that were never followed by a delogo — the backstop the per-request
 * finally cannot cover.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { reapStaleJobs } = await import("@/application/watermark/media-files");
    const removed = await reapStaleJobs();
    if (removed > 0) {
      const { logger } = await import("@/infrastructure/logging/logger");
      logger.info("Reaped stale media jobs at startup", { removed });
    }
  } catch {
    /* reaper is best-effort; never block startup */
  }
}
