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
  // Remember which generation we loaded so a new ?generationId= (e.g. switching
  // History records in-page) restores it, while re-renders for the same id stay
  // a no-op. A boolean would wedge after the first restore.
  const loadedIdRef = React.useRef<string | null>(null);
  const onRestoreRef = React.useRef(opts.onRestore);
  onRestoreRef.current = opts.onRestore;
  const onErrorRef = React.useRef(opts.onError);
  onErrorRef.current = opts.onError;

  React.useEffect(() => {
    if (!generationId || loadedIdRef.current === generationId) return;
    loadedIdRef.current = generationId;
    let cancelled = false;
    void (async () => {
      try {
        const [generation, draftState] = await Promise.all([
          getGeneration(generationId),
          loadDrafts(generationId),
        ]);
        if (cancelled) return;
        // Snapshot is Record<string, unknown>; read id defensively.
        const snapshotId = generation.generationPresetSnapshot.id;
        const presetId = typeof snapshotId === "string" ? snapshotId : undefined;
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
