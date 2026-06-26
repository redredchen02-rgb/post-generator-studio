"use client";

import * as React from "react";
import { getGeneration, loadDrafts } from "@/presentation/lib/api";
import type { Generation } from "@/domain/schemas";

export type RestorePayload = {
  generation: Generation;
  content: string;
  presetId?: string;
};

/**
 * One-shot loader for "continue editing" from History (Unit 12). When a
 * `generationId` is present, fetch the full generation and its active draft so
 * the editor can resume where the user left off. The active draft's
 * effectiveContent already falls back to the immutable outputContent when no
 * draft exists, so older generations restore their original output.
 */
export function useRestoreFromHistory(opts: {
  generationId: string | null | undefined;
  onRestore: (payload: RestorePayload) => void;
  onError: () => void;
}): void {
  const { generationId } = opts;
  const doneRef = React.useRef(false);
  const onRestoreRef = React.useRef(opts.onRestore);
  onRestoreRef.current = opts.onRestore;
  const onErrorRef = React.useRef(opts.onError);
  onErrorRef.current = opts.onError;

  React.useEffect(() => {
    if (!generationId || doneRef.current) return;
    doneRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const [generation, draftState] = await Promise.all([
          getGeneration(generationId),
          loadDrafts(generationId),
        ]);
        if (cancelled) return;
        const presetId = (generation.generationPresetSnapshot as { id?: string })?.id;
        onRestoreRef.current({ generation, content: draftState.effectiveContent, presetId });
      } catch {
        if (!cancelled) onErrorRef.current();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [generationId]);
}
