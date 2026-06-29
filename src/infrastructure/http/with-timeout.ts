/**
 * Domain-neutral HTTP timeout/cancel helpers, extracted from base-adapter so both
 * the LLM provider adapters and the watermark sidecar client share one tested core
 * (see plan: "复用的是 HTTP 调用范式，不是 provider 抽象本身").
 */

/**
 * Combine a user abort signal with a timeout signal. Uses AbortSignal.any when
 * available (Node 20.3+/modern browsers) and falls back to manual wiring so older
 * runtimes don't crash with "AbortSignal.any is not a function".
 */
export function combineSignals(userSignal: AbortSignal | undefined, timeout: AbortSignal): AbortSignal {
  if (!userSignal) return timeout;
  if (typeof AbortSignal.any === "function") return AbortSignal.any([userSignal, timeout]);
  const controller = new AbortController();
  const onAbort = (reason: unknown) => controller.abort(reason);
  for (const sig of [userSignal, timeout]) {
    if (sig.aborted) {
      controller.abort(sig.reason);
      break;
    }
    sig.addEventListener("abort", () => onAbort(sig.reason), { once: true });
  }
  return controller.signal;
}

/** Read a positive-integer millisecond timeout from an env var, else the default. */
export function timeoutMsFromEnv(envVar: string, defaultMs: number): number {
  const raw = process.env[envVar];
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultMs;
}

/** Distinguishes why a fetch with a combined signal failed. */
export type FetchFailureKind = "cancelled" | "timeout" | "network";

/**
 * Classify a fetch rejection given the user signal and the timeout signal, so
 * callers can map cancel vs timeout vs network to the right error without
 * duplicating the AbortSignal bookkeeping.
 */
export function classifyFetchFailure(
  userSignal: AbortSignal | undefined,
  timeout: AbortSignal,
): FetchFailureKind {
  if (userSignal?.aborted) return "cancelled";
  if (timeout.aborted) return "timeout";
  return "network";
}
