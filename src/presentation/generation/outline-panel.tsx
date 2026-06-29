"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/presentation/components/ui/button";
import { Input } from "@/presentation/components/ui/input";

let nextOutlineId = 0;

function useStableIds(items: string[]): string[] {
  const idsRef = React.useRef<Map<number, string>>(new Map());

  return React.useMemo(() => {
    const newIds: string[] = [];
    const usedIds = new Set<string>();

    for (let i = 0; i < items.length; i++) {
      const existingId = idsRef.current.get(i);
      if (existingId && !usedIds.has(existingId)) {
        newIds.push(existingId);
        usedIds.add(existingId);
      } else {
        const id = `outline-${nextOutlineId++}`;
        newIds.push(id);
        usedIds.add(id);
      }
    }

    idsRef.current.clear();
    for (let i = 0; i < newIds.length; i++) {
      idsRef.current.set(i, newIds[i]);
    }

    return newIds;
  }, [items.length]);
}

type OutlinePanelProps = {
  items: string[];
  busy?: boolean;
  onChangeItem: (index: number, value: string) => void;
  onAddItem: () => void;
  onRemoveItem: (index: number) => void;
  onMoveItem: (index: number, direction: -1 | 1) => void;
  onRegenerate: () => void;
  onExpand: () => void;
  onCancel: () => void;
};

export function OutlinePanel(props: OutlinePanelProps): React.ReactElement {
  const t = useTranslations("Outline");
  const hasContent = props.items.some((item) => item.trim().length > 0);
  const stableIds = useStableIds(props.items);

  return (
    <section className="app-surface grid gap-3 rounded-lg p-4 slide-up" aria-label={t("title")}>
      <h2 className="text-lg font-semibold">{t("title")}</h2>

      <ol className="grid gap-2">
        {props.items.map((item, index) => (
          <li key={stableIds[index]} className="flex items-center gap-1">
            <span className="w-5 text-right text-sm text-muted-foreground">{index + 1}.</span>
            <Input
              value={item}
              onChange={(e) => props.onChangeItem(index, e.target.value)}
              placeholder={t("sectionPlaceholder")}
            />
            <Button variant="ghost" size="icon" aria-label={t("moveUp")} disabled={index === 0} onClick={() => props.onMoveItem(index, -1)}>
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label={t("moveDown")} disabled={index === props.items.length - 1} onClick={() => props.onMoveItem(index, 1)}>
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label={t("remove")} onClick={() => props.onRemoveItem(index)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ol>

      <Button variant="outline" size="sm" className="justify-self-start" onClick={props.onAddItem}>
        <Plus className="h-4 w-4" />
        {t("addSection")}
      </Button>

      {!hasContent ? <p className="text-xs text-muted-foreground">{t("emptyHint")}</p> : null}

      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={props.onCancel}>
          <X className="h-4 w-4" />
          {t("cancel")}
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={props.busy} onClick={props.onRegenerate}>
            {props.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("regenerate")}
          </Button>
          <Button size="sm" disabled={props.busy || !hasContent} onClick={props.onExpand}>
            <Sparkles className="h-4 w-4" />
            {t("expand")}
          </Button>
        </div>
      </div>
    </section>
  );
}
