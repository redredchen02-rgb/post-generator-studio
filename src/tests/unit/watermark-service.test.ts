import { existsSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { AppErrorException } from "@/domain/schemas";
import { setWatermarkAdapter } from "@/infrastructure/watermark";
import type { WatermarkPort } from "@/domain/ports/watermark-port";
import * as mf from "@/application/watermark/media-files";
import { delogoJob } from "@/application/watermark/watermark-service";

afterEach(() => setWatermarkAdapter(undefined));

function fakeAdapter(delogo: WatermarkPort["delogo"]): WatermarkPort {
  return {
    health: async () => ({ ok: true, ffmpeg: true, ffprobe: true, face: false, mediaDirWritable: true, version: "t" }),
    watermarkImage: async () => ({ outputs: [], count: 0, moved: 0 }),
    watermarkVideo: async () => ({ outPath: "" }),
    detect: async () => ({ regions: { tl: null, tr: null, bl: null, br: null }, width: 0, height: 0 }),
    delogo,
  };
}

const REGIONS = { tl: null, tr: null, bl: null, br: "1,2,3,4" };

describe("delogoJob session lifecycle", () => {
  it("KEEPS the job dir when delogo fails with a retryable error (so it can be retried)", async () => {
    const jobId = await mf.createJob();
    await mf.saveInput(jobId, Buffer.from("x"), "in.mp4", "video");
    setWatermarkAdapter(
      fakeAdapter(async () => {
        throw new AppErrorException({ code: "SIDECAR_UNAVAILABLE", message: "down", retryable: true });
      }),
    );
    await expect(delogoJob(jobId, REGIONS)).rejects.toMatchObject({ appError: { code: "SIDECAR_UNAVAILABLE" } });
    expect(existsSync(mf.jobDir(jobId))).toBe(true); // session survived for retry
    await mf.cleanup(jobId);
  });

  it("cleans up the job dir on a non-retryable failure", async () => {
    const jobId = await mf.createJob();
    await mf.saveInput(jobId, Buffer.from("x"), "in.mp4", "video");
    setWatermarkAdapter(
      fakeAdapter(async () => {
        throw new AppErrorException({ code: "WATERMARK_ERROR", message: "bad coords" });
      }),
    );
    await expect(delogoJob(jobId, REGIONS)).rejects.toMatchObject({ appError: { code: "WATERMARK_ERROR" } });
    expect(existsSync(mf.jobDir(jobId))).toBe(false); // not retryable → cleaned
  });
});
