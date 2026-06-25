"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import { Download, RefreshCw } from "lucide-react";
import type { Generation } from "@/domain/schemas";
import { Button } from "@/presentation/components/ui/button";
import { loadGenerations } from "@/presentation/lib/api";

export function HistoryWorkspace(): React.ReactElement {
  const [generations, setGenerations] = React.useState<Generation[]>([]);
  const [selected, setSelected] = React.useState<Generation | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function refresh(): Promise<void> {
    try {
      const data = await loadGenerations();
      setGenerations(data);
      setSelected((current) => current || data[0] || null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load history");
    }
  }

  React.useEffect(() => {
    void refresh();
  }, []);

  return (
    <main className="mx-auto grid max-w-[1480px] gap-4 px-4 py-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      <section className="app-surface grid h-fit gap-3 rounded-lg p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold">History</h1>
            <p className="text-sm text-muted-foreground">重新打开已保存的生成记录。</p>
          </div>
          <Button variant="outline" size="icon" aria-label="Refresh history" onClick={() => void refresh()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        {error ? <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">{error}</div> : null}
        <div className="grid max-h-[calc(100vh-13rem)] gap-2 overflow-auto">
          {generations.map((generation) => (
            <button
              key={generation.id}
              type="button"
              className={`rounded-lg border p-3 text-left transition-colors hover:bg-muted ${
                selected?.id === generation.id ? "border-primary bg-muted" : ""
              }`}
              onClick={() => setSelected(generation)}
            >
              <div className="font-medium">{generation.title}</div>
              <div className="text-xs text-muted-foreground">
                {generation.status} · {new Date(generation.createdAt).toLocaleString()}
              </div>
            </button>
          ))}
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
              <h3 className="text-sm font-medium">Event Summary</h3>
              <pre className="whitespace-pre-wrap text-sm text-muted-foreground">{selected.eventSummary}</pre>
            </div>
            <article className="prose prose-neutral max-w-none dark:prose-invert">
              <ReactMarkdown>{selected.outputContent || selected.errorMessage || "No output content."}</ReactMarkdown>
            </article>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No generations yet.</div>
        )}
      </section>
    </main>
  );
}

