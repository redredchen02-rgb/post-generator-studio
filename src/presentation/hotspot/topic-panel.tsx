"use client";

import * as React from "react";
import { ChevronDown, Flame, Loader2, TrendingDown, TrendingUp, Sparkle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/presentation/components/ui/button";
import type { HotspotAlert } from "@/domain/schemas";
import { submitHotspotSnapshot } from "@/presentation/lib/api";
import { parseLeaderboard } from "@/presentation/hotspot/parse-leaderboard";

type TopicPanelProps = {
  available: boolean;
  /** Seed the generation form. Returns false if the user declined an overwrite. */
  onSeed: (title: string, summary: string) => boolean;
};

const KIND_ICON: Record<HotspotAlert["kind"], React.ReactNode> = {
  jump: <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />,
  drop: <TrendingDown className="h-3.5 w-3.5 text-muted-foreground" />,
  new_entry: <Sparkle className="h-3.5 w-3.5 text-amber-600" />,
};

/**
 * Manual hotspot topic seeding: paste a text leaderboard -> parse -> rank-diff via
 * the sidecar -> click an alert to seed the generation form. Collapsed by default;
 * hidden entirely when the hotspot capability is unavailable. The ranker holds a
 * single shared baseline, so the first paste only primes it and we say so.
 */
export const TopicPanel = React.memo(function TopicPanel(props: TopicPanelProps): React.ReactElement | null {
  const t = useTranslations("Hotspot");
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [alerts, setAlerts] = React.useState<HotspotAlert[] | null>(null);

  if (!props.available) return null;

  async function run(): Promise<void> {
    const { ranking, warnings: w } = parseLeaderboard(text);
    setWarnings(w);
    if (Object.keys(ranking).length === 0) {
      setError(t("emptyInput"));
      setAlerts(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setAlerts(await submitHotspotSnapshot(ranking));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failed"));
      setAlerts(null);
    } finally {
      setBusy(false);
    }
  }

  function seed(a: HotspotAlert): void {
    const summary =
      a.kind === "jump"
        ? t("seedSummaryJump", { keyword: a.keyword, delta: a.delta, rank: a.rank })
        : a.kind === "new_entry"
          ? t("seedSummaryNew", { keyword: a.keyword, rank: a.rank })
          : t("seedSummaryDrop", { keyword: a.keyword, rank: a.rank });
    props.onSeed(a.keyword, summary);
  }

  return (
    <section className="app-surface rounded-lg p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-sm font-semibold"
      >
        <span className="inline-flex items-center gap-1.5">
          <Flame className="h-4 w-4 text-amber-600" />
          {t("title")}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="mt-3 grid gap-2">
          <p className="text-xs text-muted-foreground">{t("hint")}</p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("placeholder")}
            rows={5}
            className="w-full resize-y rounded-md border bg-background p-2 text-sm font-mono"
          />
          <Button size="sm" disabled={busy || !text.trim()} onClick={() => void run()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}
            {t("analyzeBtn")}
          </Button>

          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          {warnings.length > 0 ? (
            <ul className="grid gap-0.5 text-xs text-amber-600 dark:text-amber-500">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          ) : null}

          {alerts !== null && alerts.length === 0 ? (
            <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">{t("baselinePrimed")}</p>
          ) : null}

          {alerts && alerts.length > 0 ? (
            <ul className="grid gap-1">
              {alerts.map((a) => (
                <li key={`${a.kind}:${a.keyword}`} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                  <span className="inline-flex items-center gap-1.5 truncate">
                    {KIND_ICON[a.kind]}
                    <span className="truncate font-medium">{a.keyword}</span>
                    <span className="tabular-nums text-xs text-muted-foreground">
                      {a.kind === "jump" ? t("deltaJump", { delta: a.delta }) : t(`kind.${a.kind}`)}
                    </span>
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => seed(a)}>
                    {t("useBtn")}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}

          <p className="text-[11px] text-muted-foreground">{t("sharedBaselineCaveat")}</p>
        </div>
      ) : null}
    </section>
  );
});
