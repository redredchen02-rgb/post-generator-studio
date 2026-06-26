"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/presentation/components/ui/button";
import { availableActions, type RewriteActionId } from "./rewrite-actions";

export type ToolbarPosition = { top: number; left: number };

type SelectionToolbarProps = {
  /** Anchor in editor-relative pixels, or null to hide. */
  position: ToolbarPosition | null;
  selectionChars: number;
  /** Disabled while a generation stream is running. */
  disabled?: boolean;
  /** A rewrite request is in flight. */
  busy?: boolean;
  onAction: (id: RewriteActionId) => void;
};

export function SelectionToolbar({
  position,
  selectionChars,
  disabled,
  busy,
  onAction,
}: SelectionToolbarProps): React.ReactElement | null {
  const t = useTranslations("Editor");
  if (!position || selectionChars <= 0) return null;
  const actions = availableActions(selectionChars);
  if (actions.length === 0) return null;

  return (
    <div
      role="toolbar"
      aria-label="Selection rewrite"
      className="absolute z-20 flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-md border bg-popover p-1 shadow-md"
      style={{ top: position.top, left: position.left }}
      // Keep the editor selection alive when interacting with the toolbar.
      onMouseDown={(e) => e.preventDefault()}
    >
      {busy ? (
        <span className="px-2 py-1 text-xs text-muted-foreground">{t("rewriting")}</span>
      ) : (
        actions.map((action) => (
          <Button
            key={action.id}
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => onAction(action.id)}
          >
            {t(action.labelKey)}
          </Button>
        ))
      )}
    </div>
  );
}
