"use client";

import * as React from "react";
import { AlertTriangle, Download, Loader2, RefreshCw, ScanSearch } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/presentation/components/ui/button";
import { Field } from "@/presentation/components/ui/field";
import { NativeSelect } from "@/presentation/components/ui/native-select";
import { useWatermark, type DetectResponse } from "@/presentation/media/use-watermark";

type Mode = "image" | "video" | "detect";

export function MediaWorkspace(): React.ReactElement {
  const t = useTranslations("MediaWatermark");
  const wm = useWatermark();
  const [mode, setMode] = React.useState<Mode>("image");

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-4">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      <HealthBanner state={wm.healthState} health={wm.health} onRetry={wm.checkHealth} t={t} />

      <div className="my-4 flex gap-1 rounded-md border p-1 text-sm">
        {(["image", "video", "detect"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={
              "flex-1 rounded px-3 py-1.5 transition-colors " +
              (mode === m ? "bg-primary text-primary-foreground" : "hover:bg-muted")
            }
          >
            {t(`mode.${m}`)}
          </button>
        ))}
      </div>

      {wm.error ? (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {wm.error}
        </div>
      ) : null}

      {mode === "image" ? <ImageForm wm={wm} t={t} /> : null}
      {mode === "video" ? <VideoForm wm={wm} t={t} /> : null}
      {mode === "detect" ? <DetectForm wm={wm} t={t} /> : null}
    </div>
  );
}

type WM = ReturnType<typeof useWatermark>;
type T = ReturnType<typeof useTranslations>;

function HealthBanner({
  state,
  health,
  onRetry,
  t,
}: {
  state: WM["healthState"];
  health: WM["health"];
  onRetry: () => void;
  t: T;
}): React.ReactElement | null {
  if (state === "ready") return null;
  if (state === "checking") {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t("health.checking")}
      </div>
    );
  }
  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
      <div className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400">
        <AlertTriangle className="h-4 w-4" /> {t("health.unavailable")}
      </div>
      <p className="mt-1 text-muted-foreground">{t("health.hint")}</p>
      {health && !health.ffmpeg ? <p className="mt-1 text-muted-foreground">{t("health.noFfmpeg")}</p> : null}
      <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
        <RefreshCw className="mr-1 h-3.5 w-3.5" /> {t("health.retry")}
      </Button>
    </div>
  );
}

function FileInput({ name, accept, label }: { name: string; accept: string; label: string }): React.ReactElement {
  return (
    <Field label={label}>
      <input
        type="file"
        name={name}
        accept={accept}
        required
        className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm"
      />
    </Field>
  );
}

function SubmitBtn({ busy, disabled, label }: { busy: boolean; disabled: boolean; label: string }): React.ReactElement {
  return (
    <Button type="submit" disabled={disabled || busy} className="mt-2">
      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
      {label}
    </Button>
  );
}

function ImageForm({ wm, t }: { wm: WM; t: T }): React.ReactElement {
  const disabled = wm.healthState !== "ready";
  async function onSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    await wm.watermarkFile("/api/media/watermark/image", new FormData(e.currentTarget), "watermarked.jpg");
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <FileInput name="source" accept="image/*" label={t("field.sourceImage")} />
      <FileInput name="watermark" accept="image/*" label={t("field.watermark")} />
      <Field label={t("field.position")}>
        <NativeSelect name="position" defaultValue="bottom-right">
          {["bottom-right", "bottom-left", "top-right", "top-left", "center-left", "center-right"].map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </NativeSelect>
      </Field>
      <Field label={t("field.wmWidth")}>
        <input name="wmWidth" type="number" defaultValue={264} min={1} max={4000}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
      </Field>
      <SubmitBtn busy={wm.busy} disabled={disabled} label={t("action.watermark")} />
    </form>
  );
}

function VideoForm({ wm, t }: { wm: WM; t: T }): React.ReactElement {
  const disabled = wm.healthState !== "ready";
  async function onSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    await wm.watermarkFile("/api/media/watermark/video", new FormData(e.currentTarget), "watermarked.mp4");
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <FileInput name="source" accept="video/*" label={t("field.sourceVideo")} />
      <FileInput name="watermark" accept="image/*" label={t("field.watermark")} />
      <Field label={t("field.wmMode")}>
        <NativeSelect name="wmMode" defaultValue="corner-cycle">
          {["corner-cycle", "fixed", "diagonal"].map((m) => <option key={m} value={m}>{m}</option>)}
        </NativeSelect>
      </Field>
      <Field label={t("field.resolution")} hint={t("field.resolutionHint")}>
        <NativeSelect name="resolution" defaultValue="720">
          {["original", "480", "720", "1080"].map((r) => <option key={r} value={r}>{r}</option>)}
        </NativeSelect>
      </Field>
      <SubmitBtn busy={wm.busy} disabled={disabled} label={t("action.watermark")} />
    </form>
  );
}

function DetectForm({ wm, t }: { wm: WM; t: T }): React.ReactElement {
  const disabled = wm.healthState !== "ready";
  const [result, setResult] = React.useState<DetectResponse | null>(null);

  async function onDetect(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const r = await wm.detect(new FormData(e.currentTarget));
    if (r) setResult(r);
  }

  return (
    <div className="grid gap-3">
      <form onSubmit={onDetect} className="grid gap-3">
        <FileInput name="source" accept="video/*" label={t("field.sourceVideo")} />
        <Button type="submit" disabled={disabled || wm.busy} className="mt-2">
          {wm.busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanSearch className="mr-2 h-4 w-4" />}
          {t("action.detect")}
        </Button>
      </form>

      {result ? (
        <div className="rounded-md border p-3 text-sm">
          <p className="mb-2 font-medium">{t("detect.found", { w: result.width, h: result.height })}</p>
          <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">{JSON.stringify(result.regions, null, 2)}</pre>
          <Button
            className="mt-3"
            disabled={wm.busy}
            onClick={() => wm.delogo(result.jobId, result.regions)}
          >
            {wm.busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            {t("action.delogo")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
