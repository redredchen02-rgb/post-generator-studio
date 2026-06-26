"use client";

import * as React from "react";
import { ChevronDown, Loader2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/presentation/components/ui/button";
import { QUALITY_DIMENSIONS, type QualityScore } from "@/domain/schemas";

type QualityBadgeProps = {
  score: QualityScore | null;
  scoring: boolean;
  disabled?: boolean;
  onScore: () => void;
};

/**
 * LLM-as-Judge result shown as a "test reader" suggestion: an overall badge plus
 * the five per-dimension justifications. Deliberately advisory — it never offers
 * an auto-improve action (that would invite verbosity bias).
 */
export const QualityBadge = React.memo(function QualityBadge(props: QualityBadgeProps): React.ReactElement {
  const t = useTranslations("Quality");
  const [open, setOpen] = React.useState(false);
  const { score } = props;

  if (!score) {
    return (
      <Button variant="outline" size="sm" disabled={props.disabled || props.scoring} onClick={props.onScore}>
        {props.scoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {t("scoreBtn")}
      </Button>
    );
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm font-medium"
          title={t("overallTitle")}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {t("overall", { score: score.overall })}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        <Button variant="ghost" size="sm" disabled={props.scoring} onClick={props.onScore}>
          {props.scoring ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t("rescoreBtn")}
        </Button>
      </div>
      {open ? (
        <div className="grid gap-1.5 rounded-md border p-3 text-sm">
          <p className="text-xs text-muted-foreground">{t("suggestionHint")}</p>
          {QUALITY_DIMENSIONS.map((dim) => (
            <div key={dim} className="grid grid-cols-[7rem_2rem_1fr] items-baseline gap-2">
              <span className="font-medium">{t(`dim.${dim}`)}</span>
              <span className="tabular-nums text-muted-foreground">{score[dim].score}/5</span>
              <span className="text-muted-foreground">{score[dim].justification}</span>
            </div>
          ))}
          {score.selfEvaluated ? (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">{t("selfEvaluatedCaveat")}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});
