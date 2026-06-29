"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import { ChevronDown, ChevronRight, Download, Pencil, RefreshCw, Search, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Generation } from "@/domain/schemas";
import { Button } from "@/presentation/components/ui/button";
import { Input } from "@/presentation/components/ui/input";
import { deleteGenerationRecord, loadGenerations } from "@/presentation/lib/api";
import { useApi } from "@/presentation/lib/use-api";
import { ConfirmDialog } from "@/presentation/components/ui/confirm-dialog";

const PAGE_SIZE = 10;

const ALLOWED_ELEMENTS = [
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "br", "hr",
  "a", "img",
  "ul", "ol", "li",
  "code", "pre", "blockquote",
  "table", "thead", "tbody", "tr", "th", "td",
  "strong", "em", "del", "sup", "sub",
];

const MemoizedReactMarkdown = React.memo(ReactMarkdown);

type GenerationListItemProps = {
  generation: Generation;
  isSelected: boolean;
  onSelect: (generation: Generation) => void;
  onDelete: (id: string) => void;
  deleteLabel: string;
  reuseLabel: string;
};

const GenerationListItem = React.memo(function GenerationListItem(props: GenerationListItemProps): React.ReactElement {
  const { generation, isSelected, onSelect, onDelete, deleteLabel, reuseLabel } = props;
  return (
    <div
      className={`group flex items-start gap-2 rounded-lg border p-3 transition-colors hover:bg-muted ${
        isSelected ? "border-primary bg-muted" : ""
      }`}
    >
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        onClick={() => onSelect(generation)}
      >
        <div className="font-medium">{generation.title}</div>
        <div className="text-xs text-muted-foreground">
          {generation.status} · {new Date(generation.createdAt).toLocaleString()}
        </div>
      </button>
      <a
        href={`/?title=${encodeURIComponent(generation.title)}&summary=${encodeURIComponent(generation.eventSummary)}`}
        className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground"
        aria-label={reuseLabel}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      </a>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
        aria-label={deleteLabel}
        onClick={() => onDelete(generation.id)}
      >
        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
      </Button>
    </div>
  );
});

/**
 * Resolve which item should stay selected when the list changes: keep the
 * current selection if it is still present, otherwise fall back to the first
 * item (or null when the list is empty). Pure so it can be unit-tested directly.
 */
export function resolveSelected<T extends { id: string }>(items: T[], current: T | null): T | null {
  if (items.length === 0) return null;
  // Return the matching item from the new list (not the stale `current`
  // reference) so a refreshed/edited record shows current data.
  return (current && items.find((item) => item.id === current.id)) || items[0];
}

export function HistoryWorkspace(): React.ReactElement {
  const t = useTranslations("History");
  const [search, setSearch] = React.useState("");
  const [offset, setOffset] = React.useState(0);
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null);
  const { data: paginated, loading, error, refetch } = useApi(
    React.useCallback(() => loadGenerations(search, offset, PAGE_SIZE), [search, offset]),
  );
  const generations = React.useMemo(() => paginated?.items ?? [], [paginated]);
  const total = paginated?.total ?? 0;
  const [selected, setSelected] = React.useState<Generation | null>(null);
  const [promptOpen, setPromptOpen] = React.useState(false);

  React.useEffect(() => { setOffset(0); }, [search]);

  async function handleDelete(generation: Generation): Promise<void> {
    await deleteGenerationRecord(generation.id);
    if (selected?.id === generation.id) setSelected(null);
    await refetch();
  }

  // Keep `selected` consistent with the current list: drop a selection that is
  // no longer present (after search filter or delete) and fall back to the first
  // item, or null when the list is empty.
  React.useEffect(() => {
    setSelected((current) => resolveSelected(generations, current));
  }, [generations]);

  React.useEffect(() => {
    setPromptOpen(false);
  }, [selected?.id]);

  return (
    <main className="mx-auto grid max-w-[1480px] gap-4 px-4 py-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      <section className="app-surface grid h-fit gap-3 rounded-lg p-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <Button variant="outline" size="icon" aria-label={t("refreshAriaLabel")} onClick={() => void refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {error ? <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">{error}</div> : null}
        <div className="grid max-h-[calc(100vh-16rem)] gap-2 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">{t("loading")}</div>
          ) : generations.length === 0 ? (
            <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">{t("empty")}</div>
          ) : (
            generations.map((generation) => (
              <GenerationListItem
                key={generation.id}
                generation={generation}
                isSelected={selected?.id === generation.id}
                onSelect={setSelected}
                onDelete={setPendingDeleteId}
                deleteLabel={t("deleteAriaLabel")}
                reuseLabel={t("reuseAriaLabel")}
              />
            ))
          )}
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{t("total", { count: total })}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={offset <= 0} onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}>
              {t("prevPage")}
            </Button>
            <Button variant="outline" size="sm" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset((o) => o + PAGE_SIZE)}>
              {t("nextPage")}
            </Button>
          </div>
        </div>
      </section>
      <section className="app-surface min-h-[calc(100vh-6.5rem)] rounded-lg p-4">
        {selected ? (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b pb-3">
              <div>
                <h2 className="text-xl font-semibold">{selected.title}</h2>
                <p className="text-sm text-muted-foreground">
                  {selected.providerKind} · {selected.model} · {selected.status}
                </p>
              </div>
              <div className="flex gap-2">
                <Button asChild size="sm">
                  <a href={`/?generationId=${encodeURIComponent(selected.id)}`}>
                    <Pencil className="h-4 w-4" />
                    {t("restoreEditBtn")}
                  </a>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a href={`/api/generations/${selected.id}/export?format=md`}>
                    <Download className="h-4 w-4" />
                    .md
                  </a>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a href={`/api/generations/${selected.id}/export?format=txt`}>
                    <Download className="h-4 w-4" />
                    .txt
                  </a>
                </Button>
              </div>
            </div>
            <div className="grid gap-2 rounded-lg border p-3">
              <h3 className="text-sm font-medium">{t("eventSummaryLabel")}</h3>
              <pre className="whitespace-pre-wrap text-sm text-muted-foreground">{selected.eventSummary}</pre>
            </div>
            {(selected.renderedSystemPrompt || selected.renderedUserPrompt) && (
              <div className="grid gap-2 rounded-lg border p-3">
                <button
                  type="button"
                  className="flex w-full items-center justify-between text-sm font-medium"
                  onClick={() => setPromptOpen((v) => !v)}
                >
                  {t("promptUsedLabel")}
                  {promptOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                {promptOpen && (
                  <div className="grid gap-3 pt-1">
                    {selected.renderedSystemPrompt && (
                      <div className="grid gap-1">
                        <span className="text-xs uppercase text-muted-foreground">{t("systemLabel")}</span>
                        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">{selected.renderedSystemPrompt}</pre>
                      </div>
                    )}
                    {selected.renderedUserPrompt && (
                      <div className="grid gap-1">
                        <span className="text-xs uppercase text-muted-foreground">{t("userLabel")}</span>
                        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">{selected.renderedUserPrompt}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            <article className="prose prose-neutral max-w-none dark:prose-invert">
              <MemoizedReactMarkdown allowedElements={ALLOWED_ELEMENTS}>{selected.outputContent || selected.errorMessage || t("noOutput")}</MemoizedReactMarkdown>
            </article>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t("selectRecord")}</div>
        )}
      </section>
      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}
        title={t("confirmDeleteTitle")}
        description={t("confirmDeleteDesc")}
        confirmLabel={t("deleteBtn")}
        onConfirm={async () => {
          if (pendingDeleteId) {
            const generation = generations.find((g) => g.id === pendingDeleteId);
            if (generation) await handleDelete(generation);
          }
          setPendingDeleteId(null);
        }}
        variant="destructive"
      />
    </main>
  );
}
