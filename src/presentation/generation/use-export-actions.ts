"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { stripMarkdown } from "@/lib/utils";
import type { Generation } from "@/domain/schemas";

/**
 * Clipboard copy, local file export, and save-to-history for the active content.
 * Extracted from the workspace so the component is composition + layout. `onSaved`
 * lets the caller invalidate a stale quality score once edited content is persisted.
 */
export function useExportActions(args: {
  content: string;
  title: string;
  activeGeneration: Generation | null;
  setStatus: (status: string) => void;
  onSaved?: () => void;
}) {
  const { content, title, activeGeneration, setStatus, onSaved } = args;
  const t = useTranslations("Generation");

  const copyMarkdown = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setStatus(t("markdownCopied"));
    } catch {
      setStatus(t("copyFailed"));
    }
  }, [content, setStatus, t]);

  const copyPlainText = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(stripMarkdown(content));
      setStatus(t("plainTextCopied"));
    } catch {
      setStatus(t("copyFailed"));
    }
  }, [content, setStatus, t]);

  const exportLocal = React.useCallback(
    (format: "md" | "txt") => {
      const body = format === "txt" ? stripMarkdown(content) : content;
      const blob = new Blob([body], { type: format === "md" ? "text/markdown" : "text/plain" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      const now = new Date();
      const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
      link.download = `${title || "generation"}_${ts}.${format}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 100);
      setStatus(t("exported", { format }));
    },
    [content, title, setStatus, t],
  );

  const saveToHistory = React.useCallback(async () => {
    if (!activeGeneration) return;
    try {
      const { saveGenerationContent: save } = await import("@/presentation/lib/api");
      await save(activeGeneration.id, content);
      // Editing the content invalidates any prior score — it described the old text.
      onSaved?.();
      setStatus(t("savedToHistory"));
    } catch {
      setStatus(t("saveFailed"));
    }
  }, [activeGeneration, content, onSaved, setStatus, t]);

  return { copyMarkdown, copyPlainText, exportLocal, saveToHistory };
}
