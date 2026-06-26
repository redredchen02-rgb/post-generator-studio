"use client";

import * as React from "react";
import { Check, GitCompare, History, Loader2, RotateCcw, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/presentation/components/ui/button";
import type { GenerationDraft } from "@/domain/schemas";

type DraftSwitcherProps = {
  /** Snapshot versions, oldest first. */
  versions: GenerationDraft[];
  saving: boolean;
  saved: boolean;
  busy: boolean;
  compareId: string | null;
  onSaveVersion: () => void;
  onRestore: (draftId: string) => void;
  onToggleCompare: (draftId: string) => void;
};

export function DraftSwitcher(props: DraftSwitcherProps): React.ReactElement {
  const t = useTranslations("Versions");

  return (
    <div className="app-surface flex flex-wrap items-center gap-2 rounded-lg p-2" aria-label={t("title")}>
      <span className="inline-flex items-center gap-1 text-sm font-medium">
        <History className="h-4 w-4" />
        {t("title")}
      </span>

      <span className="text-xs text-muted-foreground" aria-live="polite">
        {props.saving ? (
          <span className="inline-flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t("saving")}
          </span>
        ) : props.saved ? (
          <span className="inline-flex items-center gap-1">
            <Check className="h-3 w-3" />
            {t("saved")}
          </span>
        ) : null}
      </span>

      <Button variant="outline" size="sm" className="ml-auto" disabled={props.busy} onClick={props.onSaveVersion}>
        <Save className="h-4 w-4" />
        {t("saveVersion")}
      </Button>

      {props.versions.length === 0 ? (
        <span className="text-xs text-muted-foreground">{t("noVersions")}</span>
      ) : (
        <div className="flex w-full flex-wrap gap-2">
          {props.versions.map((version, index) => (
            <div key={version.id} className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
              <span className="font-medium">{version.label || t("versionN", { n: index + 1 })}</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("restore")}
                title={t("restore")}
                disabled={props.busy}
                onClick={() => props.onRestore(version.id)}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={props.compareId === version.id ? "default" : "ghost"}
                size="icon"
                aria-label={t("compare")}
                title={t("compare")}
                onClick={() => props.onToggleCompare(version.id)}
              >
                <GitCompare className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
