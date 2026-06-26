"use client";

import * as React from "react";
import type { GenerationDraft } from "@/domain/schemas";
import { autosaveDraft, loadDrafts, restoreDraftVersion, saveDraftVersion } from "@/presentation/lib/api";

/**
 * Version workflow on top of the draft table (Unit 11). Loads draft state when the
 * active generation changes, debounce-autosaves edits into the working draft, and
 * exposes save-as-version / restore / compare. Autosave is skipped while generating
 * (and the server rejects non-terminal writes regardless).
 */

const AUTOSAVE_DELAY_MS = 800;

export function useDraftVersions(opts: {
  generationId: string | undefined;
  content: string;
  isGenerating: boolean;
  onRestoreContent: (content: string) => void;
}) {
  const { generationId, content, isGenerating, onRestoreContent } = opts;

  const [versions, setVersions] = React.useState<GenerationDraft[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [compareId, setCompareId] = React.useState<string | null>(null);

  // Server-known content; edits diverging from this trigger an autosave. Setting it
  // on load/restore prevents those programmatic content changes from autosaving.
  const lastSavedRef = React.useRef<string>("");
  const genIdRef = React.useRef<string | undefined>(generationId);
  genIdRef.current = generationId;

  const refreshVersions = React.useCallback(async (id: string) => {
    const state = await loadDrafts(id);
    setVersions(state.drafts.filter((d) => d.kind === "snapshot"));
  }, []);

  // Load draft state when the active generation changes.
  React.useEffect(() => {
    setCompareId(null);
    setSaved(false);
    if (!generationId) {
      setVersions([]);
      lastSavedRef.current = "";
      return;
    }
    let cancelled = false;
    void loadDrafts(generationId)
      .then((state) => {
        if (cancelled) return;
        lastSavedRef.current = state.effectiveContent;
        setVersions(state.drafts.filter((d) => d.kind === "snapshot"));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [generationId]);

  // Debounced autosave of edits into the working draft.
  React.useEffect(() => {
    if (!generationId || isGenerating) return;
    if (content === lastSavedRef.current) return;
    const id = generationId;
    const timer = setTimeout(async () => {
      setSaving(true);
      try {
        await autosaveDraft(id, content);
        if (genIdRef.current === id) {
          lastSavedRef.current = content;
          setSaved(true);
        }
      } catch {
        // Non-terminal or transient — leave content unsaved; next edit retries.
      } finally {
        if (genIdRef.current === id) setSaving(false);
      }
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [content, generationId, isGenerating]);

  const saveVersion = React.useCallback(async () => {
    if (!generationId) return;
    const id = generationId;
    setSaving(true);
    try {
      // Persist the latest edit first so the snapshot captures current content.
      if (content !== lastSavedRef.current) {
        await autosaveDraft(id, content);
        lastSavedRef.current = content;
      }
      await saveDraftVersion(id);
      await refreshVersions(id);
      setSaved(true);
    } finally {
      if (genIdRef.current === id) setSaving(false);
    }
  }, [generationId, content, refreshVersions]);

  const restore = React.useCallback(
    async (draftId: string) => {
      if (!generationId) return;
      const draft = await restoreDraftVersion(generationId, draftId);
      lastSavedRef.current = draft.content;
      onRestoreContent(draft.content);
      setCompareId(null);
    },
    [generationId, onRestoreContent],
  );

  const toggleCompare = React.useCallback((draftId: string) => {
    setCompareId((prev) => (prev === draftId ? null : draftId));
  }, []);

  const compareVersion = compareId ? versions.find((v) => v.id === compareId) ?? null : null;

  return { versions, saving, saved, compareId, compareVersion, saveVersion, restore, toggleCompare };
}
