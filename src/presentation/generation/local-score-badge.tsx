"use client";

import * as React from "react";
import { AlertTriangle, ChevronDown, Gauge, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/presentation/components/ui/button";
import type { LocalScore } from "@/domain/schemas";

type LocalScoreBadgeProps = {
  score: LocalScore | null;
  scoring: boolean;
  error?: string | null;
  disabled?: boolean;
  onScore: () => void;
};

/**
 * Local vocabulary score (hotspot-sdk sidecar): a fast, deterministic, offline
 * companion to the LLM-as-Judge badge. Shown as a relative reference, not a 0-100
 * grade — the breakdown explains every signal and `ai_slop` is flagged as a warning.
 * Loading/error state is independent of the LLM badge so one never masks the other.
 */
export const LocalScoreBadge = React.memo(function LocalScoreBadge(
  props: LocalScoreBadgeProps,
): React.ReactElement {
  const t = useTranslations("LocalQuality");
  const [open, setOpen] = React.useState(false);
  const { score } = props;

  if (!score) {
    return (
      <div className="inline-flex flex-col gap-1">
        <Button variant="outline" size="sm" disabled={props.disabled || props.scoring} onClick={props.onScore}>
          {props.scoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gauge className="h-4 w-4" />}
          {t("scoreBtn")}
        </Button>
        {props.error ? <span className="text-xs text-destructive">{props.error}</span> : null}
      </div>
    );
  }

  const hasSlop = score.flags.includes("ai_slop");
  const entries = Object.entries(score.breakdown);

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm font-medium ${
            hasSlop ? "border-amber-500 text-amber-600 dark:text-amber-500" : ""
          }`}
          title={t("overallTitle")}
        >
          {hasSlop ? <AlertTriangle className="h-3.5 w-3.5" /> : <Gauge className="h-3.5 w-3.5" />}
          {t("overall", { score: score.score })}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        <Button variant="ghost" size="sm" disabled={props.scoring} onClick={props.onScore}>
          {props.scoring ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t("rescoreBtn")}
        </Button>
      </div>
      {open ? (
        <div className="grid gap-1.5 rounded-md border p-3 text-sm">
          <p className="text-xs text-muted-foreground">{t("hint")}</p>
          {entries.length === 0 ? (
            <p className="text-muted-foreground">{t("noSignals")}</p>
          ) : (
            entries.map(([key, value]) => (
              <div key={key} className="grid grid-cols-[1fr_3rem] items-baseline gap-2">
                <span className="font-mono text-xs text-muted-foreground">{key}</span>
                <span className={`tabular-nums text-right ${value < 0 ? "text-destructive" : ""}`}>
                  {value > 0 ? `+${value}` : value}
                </span>
              </div>
            ))
          )}
          {hasSlop ? (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">{t("slopCaveat")}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});
