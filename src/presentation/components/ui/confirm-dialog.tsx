"use client";

import * as React from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export type ConfirmDialogVariant = "default" | "destructive";

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  variant?: ConfirmDialogVariant;
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  variant = "destructive",
}: ConfirmDialogProps): React.ReactElement {
  const t = useTranslations("Common");

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=closed]:animate-out data-[state=open]:animate-in" />
        <AlertDialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-lg",
            "data-[state=closed]:animate-out data-[state=open]:animate-in",
          )}
        >
          <AlertDialog.Title className="text-lg font-semibold">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">{description}</AlertDialog.Description>
          <div className="mt-6 flex justify-end gap-3">
            <AlertDialog.Cancel asChild>
              <Button variant="outline">{t("cancel")}</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild onClick={onConfirm}>
              <Button variant={variant === "destructive" ? "destructive" : "default"}>{confirmLabel}</Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
