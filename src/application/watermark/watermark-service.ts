import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { SidecarHealth } from "@/domain/ports/watermark-port";
import {
  type DetectRegions,
  type ImageWatermarkParams,
  type VideoWatermarkParams,
} from "@/domain/schemas";
import { getWatermarkAdapter } from "@/infrastructure/watermark";
import * as mf from "@/application/watermark/media-files";

/** A produced file, fully read into memory so the job dir can be cleaned up immediately. */
export type ProducedFile = {
  filename: string;
  contentType: string;
  bytes: Buffer;
};

export type Upload = { bytes: Buffer; filename: string };

export function getSidecarHealth(signal?: AbortSignal): Promise<SidecarHealth> {
  return getWatermarkAdapter().health({ abortSignal: signal });
}

export async function watermarkImageJob(
  source: Upload,
  watermark: Upload,
  params: ImageWatermarkParams,
  signal?: AbortSignal,
): Promise<ProducedFile> {
  const jobId = await mf.createJob();
  try {
    await mf.saveInput(jobId, source.bytes, source.filename, "image");
    const wmPath = await mf.saveWatermark(jobId, watermark.bytes, watermark.filename);
    await getWatermarkAdapter().watermarkImage(
      { inDir: mf.inDir(jobId), outDir: mf.outDir(jobId), watermarkPath: wmPath, params },
      { abortSignal: signal },
    );
    const bytes = await readSoleOutput(mf.outDir(jobId));
    return { filename: "watermarked.jpg", contentType: "image/jpeg", bytes };
  } finally {
    await mf.cleanup(jobId);
  }
}

export async function watermarkVideoJob(
  source: Upload,
  watermark: Upload,
  params: VideoWatermarkParams,
  signal?: AbortSignal,
  wmfile2?: Upload,
): Promise<ProducedFile> {
  const jobId = await mf.createJob();
  try {
    const inPath = await mf.saveInput(jobId, source.bytes, source.filename, "video");
    const wmPath = await mf.saveWatermark(jobId, watermark.bytes, watermark.filename);
    let wm2Path: string | undefined;
    if (params.wmMode === "diagonal" && wmfile2) {
      wm2Path = await mf.saveWatermark(jobId, wmfile2.bytes, `wm2-${wmfile2.filename}`);
    }
    const outPath = path.join(mf.outDir(jobId), "output.mp4");
    await getWatermarkAdapter().watermarkVideo(
      { inPath, outPath, watermarkPath: wmPath, wmfile2: wm2Path, params },
      { abortSignal: signal },
    );
    const bytes = await readFile(outPath);
    return { filename: "watermarked.mp4", contentType: "video/mp4", bytes };
  } finally {
    await mf.cleanup(jobId);
  }
}

/**
 * Detect keeps the job alive (no cleanup) so a follow-up delogo can reference the
 * uploaded video by its opaque jobId — the client never handles a filesystem path.
 */
export async function detectJob(
  source: Upload,
  signal?: AbortSignal,
): Promise<{ jobId: string; regions: DetectRegions; width: number; height: number }> {
  const jobId = await mf.createJob();
  try {
    const inPath = await mf.saveInput(jobId, source.bytes, source.filename, "video");
    const result = await getWatermarkAdapter().detect({ inPath }, { abortSignal: signal });
    return { jobId, ...result };
  } catch (err) {
    await mf.cleanup(jobId);
    throw err;
  }
}

/** Delogo references a prior detect job by jobId (server-side session). */
export async function delogoJob(
  jobId: string,
  regions: DetectRegions,
  signal?: AbortSignal,
): Promise<ProducedFile> {
  try {
    const inPath = await mf.soleInputFile(jobId);
    const outPath = path.join(mf.outDir(jobId), "clean.mp4");
    await getWatermarkAdapter().delogo({ inPath, outPath, regions }, { abortSignal: signal });
    const bytes = await readFile(outPath);
    return { filename: "delogo.mp4", contentType: "video/mp4", bytes };
  } finally {
    await mf.cleanup(jobId);
  }
}

async function readSoleOutput(dir: string): Promise<Buffer> {
  const names = (await readdir(dir)).filter((n) => !n.startsWith("."));
  if (names.length === 0) throw new Error("水印边车未产出文件");
  return readFile(path.join(dir, names[0]));
}
