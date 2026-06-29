import { randomUUID } from "node:crypto";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppErrorException } from "@/domain/schemas";
import { getMediaDir } from "@/infrastructure/config/paths";

/**
 * Per-job temp file management under MEDIA_DIR. Job ids are crypto-random
 * (unguessable — no cross-job reference), filenames are server-generated (never
 * derived from client input), and every path is asserted to stay inside MEDIA_DIR.
 */

export const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"]);
export const VIDEO_EXTS = new Set([".mp4", ".mov", ".avi", ".mkv", ".flv", ".wmv", ".webm", ".ts", ".m4v"]);

export type MediaKind = "image" | "video";

export function newJobId(): string {
  return randomUUID();
}

export function jobDir(jobId: string): string {
  // Reject anything that isn't a clean uuid so a crafted jobId can't escape.
  if (!/^[0-9a-f-]{36}$/.test(jobId)) {
    throw new AppErrorException({ code: "VALIDATION_ERROR", message: "非法 jobId" });
  }
  const dir = path.join(getMediaDir(), jobId);
  assertInsideMediaDir(dir);
  return dir;
}

export function inDir(jobId: string): string {
  return path.join(jobDir(jobId), "in");
}

export function outDir(jobId: string): string {
  return path.join(jobDir(jobId), "out");
}

/** Watermark file lives outside in/ so the image-folder endpoint never treats it as a source. */
export function wmDir(jobId: string): string {
  return path.join(jobDir(jobId), "wm");
}

function assertInsideMediaDir(p: string): void {
  const root = path.resolve(getMediaDir());
  const resolved = path.resolve(p);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new AppErrorException({ code: "VALIDATION_ERROR", message: "路径越出 MEDIA_DIR" });
  }
}

/** Create in/, out/, wm/ for a fresh job and return its id. */
export async function createJob(): Promise<string> {
  const jobId = newJobId();
  await mkdir(inDir(jobId), { recursive: true });
  await mkdir(outDir(jobId), { recursive: true });
  await mkdir(wmDir(jobId), { recursive: true });
  return jobId;
}

function validateExt(originalName: string, kind: MediaKind): string {
  const ext = path.extname(originalName || "").toLowerCase();
  const allowed = kind === "image" ? IMAGE_EXTS : VIDEO_EXTS;
  if (!allowed.has(ext)) {
    throw new AppErrorException({
      code: "VALIDATION_ERROR",
      message: `不支持的${kind === "image" ? "图片" : "视频"}扩展名: ${ext || "(无)"}`,
    });
  }
  return ext;
}

/**
 * Write the source upload into in/ with a server-generated name (client name
 * never reaches the filesystem path). Single source file per job.
 */
export async function saveInput(
  jobId: string,
  bytes: Buffer,
  originalName: string,
  kind: MediaKind,
): Promise<string> {
  const ext = validateExt(originalName, kind);
  const dest = path.join(inDir(jobId), `${kind === "image" ? "image" : "input"}${ext}`);
  assertInsideMediaDir(dest);
  await writeFile(dest, bytes);
  return dest;
}

/** Write the watermark image into wm/ (outside in/). */
export async function saveWatermark(jobId: string, bytes: Buffer, originalName: string): Promise<string> {
  const ext = validateExt(originalName, "image");
  const dest = path.join(wmDir(jobId), `watermark${ext}`);
  assertInsideMediaDir(dest);
  await writeFile(dest, bytes);
  return dest;
}

/** The single source file in a job's in/ (single-file isolation). */
export async function soleInputFile(jobId: string): Promise<string> {
  const dir = inDir(jobId);
  const names = await readdir(dir);
  const files = names.filter((n) => !n.startsWith("."));
  if (files.length !== 1) {
    throw new AppErrorException({ code: "VALIDATION_ERROR", message: "任务输入文件缺失或不唯一" });
  }
  return path.join(dir, files[0]);
}

/** Remove the whole job directory. Safe to call in a finally. */
export async function cleanup(jobId: string): Promise<void> {
  try {
    await rm(jobDir(jobId), { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }
}

/**
 * Startup TTL reaper: remove job dirs older than maxAgeMs. Backstop for SIGKILL /
 * crash orphans that the per-request finally can't cover.
 */
export async function reapStaleJobs(maxAgeMs = 6 * 60 * 60 * 1000): Promise<number> {
  const root = getMediaDir();
  let removed = 0;
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return 0;
  }
  const { stat } = await import("node:fs/promises");
  const now = Date.now();
  for (const name of entries) {
    if (!/^[0-9a-f-]{36}$/.test(name)) continue;
    try {
      const s = await stat(path.join(root, name));
      if (now - s.mtimeMs > maxAgeMs) {
        await rm(path.join(root, name), { recursive: true, force: true });
        removed++;
      }
    } catch {
      /* skip */
    }
  }
  return removed;
}
