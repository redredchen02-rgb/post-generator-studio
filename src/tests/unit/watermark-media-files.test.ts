import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as mf from "@/application/watermark/media-files";
import { getMediaDir } from "@/infrastructure/config/paths";
import { AppErrorException } from "@/domain/schemas";

describe("media-files", () => {
  it("creates a job with a crypto-random uuid id and in/out/wm dirs", async () => {
    const jobId = await mf.createJob();
    expect(jobId).toMatch(/^[0-9a-f-]{36}$/);
    expect(existsSync(mf.inDir(jobId))).toBe(true);
    expect(existsSync(mf.outDir(jobId))).toBe(true);
    expect(existsSync(mf.wmDir(jobId))).toBe(true);
    await mf.cleanup(jobId);
    expect(existsSync(mf.jobDir(jobId))).toBe(false);
  });

  it("rejects a crafted jobId that would escape MEDIA_DIR", () => {
    expect(() => mf.jobDir("../../etc")).toThrow(AppErrorException);
  });

  it("saves input with a server-generated name, ignoring a malicious client filename", async () => {
    const jobId = await mf.createJob();
    const dest = await mf.saveInput(jobId, Buffer.from("x"), "../../evil.png", "image");
    expect(path.dirname(dest)).toBe(mf.inDir(jobId));
    expect(path.basename(dest)).toBe("image.png");
    await mf.cleanup(jobId);
  });

  it("rejects an unsupported extension", async () => {
    const jobId = await mf.createJob();
    await expect(mf.saveInput(jobId, Buffer.from("x"), "evil.exe", "image")).rejects.toThrow(AppErrorException);
    await mf.cleanup(jobId);
  });

  it("soleInputFile enforces single-file isolation", async () => {
    const jobId = await mf.createJob();
    await mf.saveInput(jobId, Buffer.from("x"), "a.png", "image");
    expect(await mf.soleInputFile(jobId)).toContain("image.png");
    await writeFile(path.join(mf.inDir(jobId), "extra.png"), "y");
    await expect(mf.soleInputFile(jobId)).rejects.toThrow(AppErrorException);
    await mf.cleanup(jobId);
  });

  it("reaps stale job dirs", async () => {
    const stale = path.join(getMediaDir(), "00000000-0000-0000-0000-000000000000");
    await mkdir(stale, { recursive: true });
    const removed = await mf.reapStaleJobs(-1); // everything older than -1ms
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(existsSync(stale)).toBe(false);
  });
});
