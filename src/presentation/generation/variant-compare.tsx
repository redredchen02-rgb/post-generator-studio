"use client";

import * as React from "react";
import { Check, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/presentation/components/ui/button";
import { Textarea } from "@/presentation/components/ui/textarea";
import { computeTextMetrics } from "@/lib/text-metrics";
import type { VariantSlot } from "./use-variant-generation";

type VariantCompareProps = {
  variants: VariantSlot[];
  busy: boolean;
  onEditVariant: (index: number, content: string) => void;
  onSelect: (index: number) => void;
  onCancel: () => void;
  onDiscard: () => void;
};

function statusTone(status: VariantSlot["status"]): string {
  if (status === "completed") return "text-emerald-600 dark:text-emerald-500";
  if (status === "failed") return "text-destructive";
  if (status === "cancelled") return "text-muted-foreground";
  return "text-muted-foreground";
}

export function VariantCompare(props: VariantCompareProps): React.ReactElement {
  const t = useTranslations("Variant");

  return (
    <section className="app-surface grid min-h-[calc(100vh-6.5rem)] grid-rows-[auto_minmax(0,1fr)] gap-3 rounded-lg p-4 slide-up" aria-label={t("title")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex gap-2">
          {props.busy ? (
            <Button variant="outline" size="sm" onClick={props.onCancel}>
              <X className="h-4 w-4" />
              {t("cancelBtn")}
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={props.onDiscard}>
              <X className="h-4 w-4" />
              {t("discardBtn")}
            </Button>
          )}
        </div>
      </div>

      <div className="grid min-h-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {props.variants.map((variant) => {
          const metrics = computeTextMetrics(variant.content);
          const ready = variant.status === "completed";
          return (
            <div key={variant.index} className="flex min-h-0 flex-col gap-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t("variantLabel", { n: variant.index + 1 })}</span>
                <span className={`inline-flex items-center gap-1 text-xs ${statusTone(variant.status)}`}>
                  {variant.status === "streaming" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  {t(`status.${variant.status}`)}
                </span>
              </div>

              {variant.status === "failed" ? (
                <p className="rounded border border-destructive/30 bg-destructive/10 p-2 text-xs">{variant.error}</p>
              ) : (
                <Textarea
                  value={variant.content}
                  onChange={(e) => props.onEditVariant(variant.index, e.target.value)}
                  readOnly={!ready}
                  placeholder={t("streamingPlaceholder")}
                  className="min-h-[320px] flex-1 text-sm"
                />
              )}

              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{t("words", { count: metrics.words })}</span>
                <Button size="sm" disabled={!ready || !variant.content.trim()} onClick={() => props.onSelect(variant.index)}>
                  <Check className="h-4 w-4" />
                  {t("selectBtn")}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
