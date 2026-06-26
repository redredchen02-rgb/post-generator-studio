"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Loader2, Trash2, CheckCircle2 } from "lucide-react";
import { Header } from "./settings-workspace";
import { Button } from "@/presentation/components/ui/button";
import { ConfirmDialog } from "@/presentation/components/ui/confirm-dialog";
import { useBootstrapStore } from "@/presentation/store/bootstrap-store";
import {
  createBackup,
  listBackups,
  deleteBackup,
  restoreBackup,
  type BackupMeta,
} from "@/presentation/lib/api";

type PendingAction = { kind: "restore" | "delete"; id: string };

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function StoragePanel(): React.ReactElement {
  const t = useTranslations("Settings.storage");
  const invalidateBootstrap = useBootstrapStore((s) => s.invalidate);

  const [backups, setBackups] = React.useState<BackupMeta[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<PendingAction | null>(null);

  const refresh = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setBackups(await listBackups());
    } catch (err) {
      setError(err instanceof Error ? err.message : t("backupFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCreate = async (): Promise<void> => {
    try {
      setCreating(true);
      setError(null);
      setSuccess(null);
      await createBackup();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("backupFailed"));
    } finally {
      setCreating(false);
    }
  };

  const runRestore = async (id: string): Promise<void> => {
    try {
      setBusyId(id);
      setError(null);
      setSuccess(null);
      await restoreBackup(id);
      // The whole DB was swapped — mark bootstrap (providers/templates/presets)
      // stale so it refetches the restored data.
      invalidateBootstrap();
      setSuccess(t("restoreSuccess"));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("restoreFailed"));
    } finally {
      setBusyId(null);
    }
  };

  const runDelete = async (id: string): Promise<void> => {
    try {
      setBusyId(id);
      setError(null);
      await deleteBackup(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("deleteFailed"));
    } finally {
      setBusyId(null);
    }
  };

  const confirmPending = async (): Promise<void> => {
    const action = pending;
    setPending(null);
    if (!action) return;
    if (action.kind === "restore") await runRestore(action.id);
    else await runDelete(action.id);
  };

  return (
    <div className="grid gap-4">
      <Header title={t("title")} description={t("subtitle")} />

      <div className="grid gap-3 rounded-lg border p-4 text-sm">
        <p>{t("apiKeysInfo")}</p>
        <p>{t("localStorageInfo")}</p>
        <p>{t("exportsInfo")}</p>
      </div>

      <div className="grid gap-3 rounded-lg border p-4">
        <h2 className="text-base font-semibold">{t("backupTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("backupSubtitle")}</p>

        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {t("secretsWarning")}
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={handleCreate} disabled={creating}>
            {creating && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {creating ? t("backupCreating") : t("createBackup")}
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {success && (
          <p className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            {success}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        ) : backups.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noBackups")}</p>
        ) : (
          <div className="grid gap-2">
            {backups.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <div className="grid gap-0.5">
                  <span className="text-xs text-muted-foreground">
                    {t("createdAt")}: {new Date(b.createdAt).toLocaleString()}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t("fileSize")}: {formatFileSize(b.fileSizeBytes)}
                    {" · "}
                    {t("includesSecrets")}: {b.includesSecrets ? t("yes") : t("no")}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === b.id}
                    onClick={() => setPending({ kind: "restore", id: b.id })}
                  >
                    {busyId === b.id ? t("restoring") : t("restoreBtn")}
                  </Button>
                  <button
                    type="button"
                    disabled={busyId === b.id}
                    onClick={() => setPending({ kind: "delete", id: b.id })}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                    aria-label={t("deleteBtn")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={pending?.kind === "restore" ? t("restoreConfirmTitle") : t("deleteConfirmTitle")}
        description={pending?.kind === "restore" ? t("restoreConfirmDesc") : t("deleteConfirmDesc")}
        confirmLabel={pending?.kind === "restore" ? t("restoreBtn") : t("deleteBtn")}
        onConfirm={confirmPending}
        variant="destructive"
      />
    </div>
  );
}
