"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { scoreGeneration } from "@/presentation/lib/api";
import type { Generation, QualityScore } from "@/domain/schemas";

/**
 * LLM-as-judge quality scoring for the active generation. Owns the score state, the
 * reset-on-generation-change effect, and the retry/race-guard logic that the workspace
 * previously inlined. `clearScore` lets the caller invalidate a stale score (e.g. after
 * the user edits and saves the content).
 */
export function useScoring(args: {
  activeGeneration: Generation | null;
  content: string;
  presetId: string;
  providerProfileId?: string;
  setStatus: (status: string) => void;
}) {
  const { activeGeneration, content, presetId, providerProfileId, setStatus } = args;
  const t = useTranslations("Generation");
  const [qualityScore, setQualityScore] = React.useState<QualityScore | null>(null);
  const [scoring, setScoring] = React.useState(false);

  // Tracks the active generation id so an in-flight score request is discarded if the
  // user switches generations before it returns.
  const activeGenIdRef = React.useRef<string | undefined>(activeGeneration?.id);
  activeGenIdRef.current = activeGeneration?.id;

  // Reset the badge when the active generation changes; reflect an already-scored one.
  React.useEffect(() => {
    setQualityScore(activeGeneration?.qualityScore ?? null);
  }, [activeGeneration?.id, activeGeneration?.qualityScore]);

  const score = React.useCallback(async () => {
    if (!activeGeneration || !content.trim() || scoring) return;
    const genId = activeGeneration.id;
    setScoring(true);
    const MAX_RETRIES = 1;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await scoreGeneration(genId, { presetId, providerProfileId });
        if (activeGenIdRef.current === genId) setQualityScore(result);
        break;
      } catch (err) {
        // 5xx only: \b5\d\d\b matches 500–599 but not 405/415 or "5 chars"
        // (includes("5") matched any message with the digit 5 — far too broad).
        const isRetryable = err instanceof Error && (err.message.includes("429") || /\b5\d\d\b/.test(err.message));
        if (isRetryable && attempt < MAX_RETRIES) continue;
        if (activeGenIdRef.current === genId) setStatus(t("scoreFailed"));
      }
    }
    setScoring(false);
  }, [activeGeneration, content, scoring, presetId, providerProfileId, t, setStatus]);

  const clearScore = React.useCallback(() => setQualityScore(null), []);

  return { qualityScore, scoring, score, clearScore };
}
