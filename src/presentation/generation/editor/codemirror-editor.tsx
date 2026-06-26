"use client";

import * as React from "react";
import CodeMirror, { EditorView, type ViewUpdate } from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { useTranslations } from "next-intl";
import { Button } from "@/presentation/components/ui/button";
import { requestCompletion } from "@/presentation/lib/api";
import { SelectionToolbar, type ToolbarPosition } from "./selection-toolbar";
import {
  buildContinuePrompt,
  buildParagraphPrompt,
  buildRewritePrompt,
  paragraphRangeAt,
  sanitizeCompletion,
  type RewriteActionId,
} from "./rewrite-actions";

type CodeMirrorEditorProps = {
  value: string;
  onChange: (value: string) => void;
  /** During streaming the editor is read-only — tokens are appended programmatically (D7). */
  readOnly?: boolean;
  fontSize?: number;
  placeholder?: string;
  className?: string;
  /** Article title and preset, used for selection rewrites. Rewrite is off without a preset. */
  title?: string;
  presetId?: string;
  providerProfileId?: string;
};

// Prose, not code: wrap long lines and drop the code-editor chrome (gutters, line numbers).
const EXTENSIONS = [markdown(), EditorView.lineWrapping];
const CONTEXT_CHARS = 240;

type Selection = { from: number; to: number; pos: ToolbarPosition };
type PendingDiff = { from: number; to: number; original: string; suggestion: string };

export function CodeMirrorEditor({
  value,
  onChange,
  readOnly = false,
  fontSize,
  placeholder,
  className,
  title = "",
  presetId,
  providerProfileId,
}: CodeMirrorEditorProps): React.ReactElement {
  const t = useTranslations("Editor");
  const containerRef = React.useRef<HTMLDivElement>(null);
  const viewRef = React.useRef<EditorView | null>(null);
  const cursorRef = React.useRef(0);
  // Monotonic request id: only the newest in-flight completion may touch state,
  // so out-of-order responses and post-unmount resolves are ignored.
  const seqRef = React.useRef(0);
  const mountedRef = React.useRef(true);
  const [selection, setSelection] = React.useState<Selection | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [diff, _setDiff] = React.useState<PendingDiff | null>(null);
  const diffRef = React.useRef<PendingDiff | null>(null);
  const setDiff = React.useCallback((value: PendingDiff | null) => {
    diffRef.current = value;
    _setDiff(value);
  }, []);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const rewriteEnabled = Boolean(presetId) && !readOnly;

  /**
   * Shared completion runner: guards busy/error state, ignores stale/unmounted
   * responses, sanitizes the reply, and surfaces empty results instead of failing
   * silently. `onText` only runs for the newest request with a non-empty result.
   */
  const executeCompletion = React.useCallback(
    async (build: () => { systemPrompt: string; prompt: string }, onText: (text: string) => void) => {
      if (!presetId) return;
      const seq = ++seqRef.current;
      const { systemPrompt, prompt } = build();
      setBusy(true);
      setError(null);
      try {
        const result = await requestCompletion({ prompt, systemPrompt, presetId, providerProfileId });
        if (!mountedRef.current || seq !== seqRef.current) return;
        const text = sanitizeCompletion(result.content);
        if (!text) {
          setError(t("emptyCompletion"));
          return;
        }
        onText(text);
      } catch (e) {
        if (!mountedRef.current || seq !== seqRef.current) return;
        setError(e instanceof Error ? e.message : t("rewriteFailed"));
      } finally {
        if (mountedRef.current && seq === seqRef.current) setBusy(false);
      }
    },
    [presetId, providerProfileId, t],
  );

  const refreshSelection = React.useCallback(
    (view: EditorView) => {
      if (!rewriteEnabled) {
        setSelection(null);
        return;
      }
      const range = view.state.selection.main;
      if (range.empty) {
        setSelection(null);
        return;
      }
      const coords = view.coordsAtPos(range.from);
      const box = containerRef.current?.getBoundingClientRect();
      if (!coords || !box) {
        setSelection(null);
        return;
      }
      setSelection({
        from: range.from,
        to: range.to,
        pos: { top: coords.top - box.top, left: coords.left - box.left },
      });
    },
    [rewriteEnabled],
  );

  const handleUpdate = React.useCallback(
    (update: ViewUpdate) => {
      if (update.selectionSet || update.docChanged || update.focusChanged) {
        cursorRef.current = update.state.selection.main.head;
        // A pending diff is anchored to a stale range; drop it if the user moves on.
        if (diffRef.current && update.docChanged) {
          diffRef.current = null;
          setDiff(null);
        }
        refreshSelection(update.view);
      }
    },
    [refreshSelection],
  );

  const runAction = React.useCallback(
    (id: RewriteActionId) => {
      const view = viewRef.current;
      if (!view || !selection) return;
      const { from, to } = selection;
      const doc = view.state.doc.toString();
      const original = doc.slice(from, to);
      void executeCompletion(
        () =>
          buildRewritePrompt(id, {
            title,
            selection: original,
            before: doc.slice(Math.max(0, from - CONTEXT_CHARS), from),
            after: doc.slice(to, to + CONTEXT_CHARS),
            tone: id === "tone" ? t("defaultTone") : undefined,
          }),
        (text) => setDiff({ from, to, original, suggestion: text }),
      );
    },
    [selection, title, executeCompletion, t],
  );

  const runContinue = React.useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const fullText = view.state.doc.toString();
    void executeCompletion(
      () => buildContinuePrompt({ title, fullText }),
      (text) => {
        if (!mountedRef.current) return;
        const v = viewRef.current;
        if (!v) return;
        // Append at the live document end with current-state separator, not a stale length.
        const end = v.state.doc.length;
        v.dispatch({ changes: { from: end, to: end, insert: (end > 0 ? "\n\n" : "") + text } });
      },
    );
  }, [title, executeCompletion]);

  const runParagraphRegen = React.useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const doc = view.state.doc.toString();
    const range = paragraphRangeAt(doc, cursorRef.current);
    if (!range) {
      setError(t("noParagraph"));
      return;
    }
    const original = doc.slice(range.from, range.to);
    void executeCompletion(
      () =>
        buildParagraphPrompt({
          title,
          paragraph: original,
          before: doc.slice(Math.max(0, range.from - CONTEXT_CHARS), range.from),
          after: doc.slice(range.to, range.to + CONTEXT_CHARS),
        }),
      (text) => {
        if (!mountedRef.current) return;
        setDiff({ from: range.from, to: range.to, original, suggestion: text });
      },
    );
  }, [title, executeCompletion, t]);

  const acceptDiff = React.useCallback(() => {
    const view = viewRef.current;
    if (!view || !diff) return;
    // Guard against a stale anchor: if the document changed under the suggestion
    // (edit landed while the request was in flight), refuse rather than corrupt.
    if (view.state.doc.sliceString(diff.from, diff.to) !== diff.original) {
      setError(t("diffStale"));
      setDiff(null);
      return;
    }
    // Replace only the selected range; head and tail stay byte-identical.
    view.dispatch({ changes: { from: diff.from, to: diff.to, insert: diff.suggestion } });
    setDiff(null);
    setSelection(null);
  }, [diff, t]);

  const rejectDiff = React.useCallback(() => {
    setDiff(null);
  }, []);

  return (
    <div ref={containerRef} className="relative h-full">
      <CodeMirror
        value={value}
        onChange={onChange}
        onCreateEditor={(view) => {
          viewRef.current = view;
        }}
        onUpdate={handleUpdate}
        readOnly={readOnly}
        // editable=false also drops the DOM contenteditable, so streaming tokens can't
        // race a cursor in the document; readOnly alone keeps it focusable/selectable.
        editable={!readOnly}
        placeholder={placeholder}
        extensions={EXTENSIONS}
        theme="none"
        height="100%"
        className={className}
        style={fontSize ? { fontSize } : undefined}
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLine: !readOnly,
          highlightActiveLineGutter: false,
          highlightSelectionMatches: false,
          searchKeymap: false,
        }}
      />

      {rewriteEnabled && !diff ? (
        <div className="pointer-events-none absolute bottom-2 right-2 z-20 flex gap-1">
          <Button
            size="sm"
            variant="secondary"
            className="pointer-events-auto"
            disabled={busy}
            onClick={() => void runParagraphRegen()}
          >
            {t("regenParagraph")}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="pointer-events-auto"
            disabled={busy}
            onClick={() => void runContinue()}
          >
            {busy ? t("processing") : t("continue")}
          </Button>
        </div>
      ) : null}

      {!diff ? (
        <SelectionToolbar
          position={selection?.pos ?? null}
          selectionChars={selection ? selection.to - selection.from : 0}
          disabled={readOnly}
          busy={busy}
          onAction={runAction}
        />
      ) : null}

      {diff ? (
        <div
          role="dialog"
          aria-label="Rewrite suggestion"
          className="absolute left-1/2 top-4 z-30 w-[min(32rem,90%)] -translate-x-1/2 rounded-md border bg-popover p-3 text-sm shadow-lg"
        >
          <p className="mb-1 text-xs font-medium text-muted-foreground">{t("original")}</p>
          <p className="mb-2 whitespace-pre-wrap text-muted-foreground line-through">{diff.original}</p>
          <p className="mb-1 text-xs font-medium text-muted-foreground">{t("suggestion")}</p>
          <p className="mb-3 whitespace-pre-wrap">{diff.suggestion}</p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={rejectDiff}>
              {t("reject")}
            </Button>
            <Button size="sm" onClick={acceptDiff}>
              {t("accept")}
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="absolute bottom-2 left-1/2 z-30 -translate-x-1/2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1 text-xs text-destructive">
          {error}
        </div>
      ) : null}
    </div>
  );
}
