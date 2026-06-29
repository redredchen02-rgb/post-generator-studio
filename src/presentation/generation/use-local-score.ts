"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { localScoreGeneration } from "@/presentation/lib/api";
import type { Generation, LocalScore } from "@/domain/schemas";

/**
 * Local (non-LLM) copy score from the hotspot sidecar. Non-persistent by design —
 * recomputed on demand and cleared whenever the active generation changes. Mirrors
 * useScoring's race guard so a switch mid-request discards the stale result.
 */
export function useLocalScore(args: { activeGeneration: Generation | null; content: string }) {
  const { activeGeneration, content } = args;
  const t = useTranslations("Generation");
  const [localScore, setLocalScore] = React.useState<LocalScore | null>(null);
  const [localScoring, setLocalScoring] = React.useState(false);
  const [localScoreError, setLocalScoreError] = React.useState<string | null>(null);

  const activeGenIdRef = React.useRef<string | undefined>(activeGeneration?.id);
  activeGenIdRef.current = activeGeneration?.id;

  React.useEffect(() => {
    setLocalScore(null);
    setLocalScoreError(null);
  }, [activeGeneration?.id]);

  const scoreLocal = React.useCallback(async () => {
    if (!activeGeneration || !content.trim() || localScoring) return;
    const genId = activeGeneration.id;
    setLocalScoring(true);
    setLocalScoreError(null);
    try {
      const score = await localScoreGeneration(genId);
      if (activeGenIdRef.current === genId) setLocalScore(score);
    } catch (err) {
      if (activeGenIdRef.current === genId) {
        setLocalScoreError(err instanceof Error ? err.message : t("scoreFailed"));
      }
    } finally {
      setLocalScoring(false);
    }
  }, [activeGeneration, content, localScoring, t]);

  const clearLocalScore = React.useCallback(() => setLocalScore(null), []);

  return { localScore, localScoring, localScoreError, scoreLocal, clearLocalScore };
}
