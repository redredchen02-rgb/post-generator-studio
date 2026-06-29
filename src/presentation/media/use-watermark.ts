"use client";

import * as React from "react";
import type { DetectRegions } from "@/domain/schemas";
import type { SidecarHealth } from "@/domain/ports/watermark-port";
import { ApiClientError } from "@/presentation/lib/api";

export type DetectResponse = { jobId: string; regions: DetectRegions; width: number; height: number };

async function postForm(url: string, form: FormData): Promise<Response> {
  const res = await fetch(url, { method: "POST", body: form });
  return res;
}

async function asError(res: Response): Promise<ApiClientError> {
  try {
    const body = (await res.json()) as { error?: { code: string; message: string } };
    if (body.error) return new ApiClientError(body.error);
  } catch {
    /* fall through */
  }
  return new ApiClientError({ code: "REQUEST_FAILED", message: `请求失败 (${res.status})` });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Hook exposing sidecar health + the four watermark operations with loading/error. */
export function useWatermark() {
  const [health, setHealth] = React.useState<SidecarHealth | null>(null);
  const [healthState, setHealthState] = React.useState<"checking" | "ready" | "unavailable">("checking");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const checkHealth = React.useCallback(async () => {
    setHealthState("checking");
    try {
      const res = await fetch("/api/media/health");
      if (!res.ok) throw await asError(res);
      const h = (await res.json()) as SidecarHealth;
      setHealth(h);
      setHealthState(h.ok ? "ready" : "unavailable");
    } catch {
      setHealth(null);
      setHealthState("unavailable");
    }
  }, []);

  React.useEffect(() => {
    void checkHealth();
  }, [checkHealth]);

  const run = React.useCallback(async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : String(err));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);

  const watermarkFile = React.useCallback(
    (url: string, form: FormData, downloadName: string) =>
      run(async () => {
        const res = await postForm(url, form);
        if (!res.ok) throw await asError(res);
        downloadBlob(await res.blob(), downloadName);
        return true;
      }),
    [run],
  );

  const detect = React.useCallback(
    (form: FormData) =>
      run(async () => {
        const res = await postForm("/api/media/detect", form);
        if (!res.ok) throw await asError(res);
        return (await res.json()) as DetectResponse;
      }),
    [run],
  );

  const delogo = React.useCallback(
    (jobId: string, regions: DetectRegions) =>
      run(async () => {
        const res = await fetch("/api/media/delogo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId, regions }),
        });
        if (!res.ok) throw await asError(res);
        downloadBlob(await res.blob(), "delogo.mp4");
        return true;
      }),
    [run],
  );

  return { health, healthState, busy, error, checkHealth, watermarkFile, detect, delogo };
}
