"use client";

import * as React from "react";
import { MergeView } from "@codemirror/merge";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/presentation/components/ui/button";

type VersionCompareProps = {
  /** Left side (a saved version). */
  left: string;
  leftLabel: string;
  /** Right side (the current working draft). */
  right: string;
  rightLabel: string;
  onClose: () => void;
};

/** Read-only side-by-side diff of a saved version against the current draft (@codemirror/merge). */
export function VersionCompare(props: VersionCompareProps): React.ReactElement {
  const t = useTranslations("Versions");
  const hostRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const readOnly = [EditorView.editable.of(false), EditorState.readOnly.of(true), EditorView.lineWrapping];
    const view = new MergeView({
      a: { doc: props.left, extensions: readOnly },
      b: { doc: props.right, extensions: readOnly },
      parent: host,
    });
    return () => view.destroy();
  }, [props.left, props.right]);

  return (
    <section className="app-surface grid min-h-[calc(100vh-6.5rem)] grid-rows-[auto_minmax(0,1fr)] gap-3 rounded-lg p-4 slide-up" aria-label={t("compareTitle")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t("compareTitle")}</h2>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{t("compareSides", { left: props.leftLabel, right: props.rightLabel })}</span>
          <Button variant="ghost" size="sm" onClick={props.onClose}>
            <X className="h-4 w-4" />
            {t("closeCompare")}
          </Button>
        </div>
      </div>
      <div ref={hostRef} className="min-h-0 overflow-auto rounded-md border bg-background text-sm" />
    </section>
  );
}
