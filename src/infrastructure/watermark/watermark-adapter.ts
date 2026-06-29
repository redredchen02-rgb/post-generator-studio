import type {
  SidecarHealth,
  WatermarkOptions,
  WatermarkPort,
} from "@/domain/ports/watermark-port";
import { AppErrorException, type DetectRegions, type DetectResult } from "@/domain/schemas";
import {
  getImageTimeoutMs,
  getSidecarSecret,
  getSidecarUrl,
  getVideoTimeoutMs,
} from "@/infrastructure/config/sidecar";
import { classifyFetchFailure, combineSignals } from "@/infrastructure/http/with-timeout";

/**
 * Thin HTTP client for the omniwm FastAPI sidecar. NOT a BaseAdapter subclass —
 * watermarking is synchronous request/response, not streaming. Reuses only the
 * domain-neutral timeout/cancel helpers from with-timeout.ts.
 */
export class WatermarkAdapter implements WatermarkPort {
  private async call<T>(
    path: string,
    body: unknown,
    timeoutMs: number,
    options: WatermarkOptions | undefined,
  ): Promise<T> {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = combineSignals(options?.abortSignal, timeout);
    const secret = getSidecarSecret();

    let response: Response;
    try {
      response = await fetch(`${getSidecarUrl()}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(secret ? { "x-omniwm-secret": secret } : {}),
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      throw this.fetchError(err, options?.abortSignal, timeout);
    }
    return this.parse<T>(response);
  }

  private fetchError(err: unknown, userSignal: AbortSignal | undefined, timeout: AbortSignal): AppErrorException {
    const kind = classifyFetchFailure(userSignal, timeout);
    if (kind === "cancelled") {
      return new AppErrorException({ code: "WATERMARK_CANCELLED", message: "水印请求被取消" });
    }
    if (kind === "timeout") {
      return new AppErrorException({ code: "WATERMARK_TIMEOUT", message: "水印边车请求超时", retryable: true });
    }
    return new AppErrorException({
      code: "SIDECAR_UNAVAILABLE",
      message: "无法连接水印边车（omniwm sidecar 未启动？）",
      retryable: true,
      details: { cause: err instanceof Error ? err.message : String(err) },
    });
  }

  private async parse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      let code = "SIDECAR_ERROR";
      let message = `水印边车返回 ${response.status}`;
      try {
        const body = (await response.json()) as { code?: string; message?: string };
        if (body.code) code = body.code;
        if (body.message) message = body.message;
      } catch {
        /* non-JSON error body — keep defaults */
      }
      throw new AppErrorException({
        code,
        message,
        retryable: response.status >= 500 || response.status === 429,
      });
    }
    try {
      return (await response.json()) as T;
    } catch {
      throw new AppErrorException({ code: "SIDECAR_ERROR", message: "水印边车返回了无法解析的响应" });
    }
  }

  async health(options?: WatermarkOptions): Promise<SidecarHealth> {
    const timeout = AbortSignal.timeout(5_000);
    const signal = combineSignals(options?.abortSignal, timeout);
    const secret = getSidecarSecret();
    let response: Response;
    try {
      response = await fetch(`${getSidecarUrl()}/health`, {
        headers: secret ? { "x-omniwm-secret": secret } : {},
        signal,
      });
    } catch (err) {
      throw this.fetchError(err, options?.abortSignal, timeout);
    }
    const raw = await this.parse<{
      ok: boolean;
      ffmpeg: boolean;
      ffprobe: boolean;
      face: boolean;
      media_dir_writable: boolean;
      version: string;
    }>(response);
    return {
      ok: raw.ok,
      ffmpeg: raw.ffmpeg,
      ffprobe: raw.ffprobe,
      face: raw.face,
      mediaDirWritable: raw.media_dir_writable,
      version: raw.version,
    };
  }

  watermarkImage(
    input: { inDir: string; outDir: string; watermarkPath: string; params: import("@/domain/schemas").ImageWatermarkParams },
    options?: WatermarkOptions,
  ): Promise<{ outputs: string[]; count: number; moved: number }> {
    return this.call(
      "/watermark/image",
      {
        in_dir: input.inDir,
        out_dir: input.outDir,
        watermark_path: input.watermarkPath,
        wm_width: input.params.wmWidth,
        img_width: input.params.imgWidth,
        margin: input.params.margin,
        opacity: input.params.opacity,
        position: input.params.position,
      },
      getImageTimeoutMs(),
      options,
    );
  }

  watermarkVideo(
    input: {
      inPath: string;
      outPath: string;
      watermarkPath: string;
      wmfile2?: string;
      params: import("@/domain/schemas").VideoWatermarkParams;
    },
    options?: WatermarkOptions,
  ): Promise<{ outPath: string }> {
    return this.call<{ out_path: string }>(
      "/watermark/video",
      {
        in_path: input.inPath,
        out_path: input.outPath,
        watermark_path: input.watermarkPath,
        wmfile2: input.wmfile2 ?? "",
        wm_mode: input.params.wmMode,
        fixed_pos: input.params.fixedPos,
        scale_landscape: input.params.scaleLandscape,
        scale_portrait: input.params.scalePortrait,
        resolution: input.params.resolution,
        bitrate: input.params.bitrate,
        fps: input.params.fps,
      },
      getVideoTimeoutMs(),
      options,
    ).then((r) => ({ outPath: r.out_path }));
  }

  detect(input: { inPath: string }, options?: WatermarkOptions): Promise<DetectResult> {
    return this.call<DetectResult>("/detect", { in_path: input.inPath }, getVideoTimeoutMs(), options);
  }

  delogo(
    input: { inPath: string; outPath: string; regions: DetectRegions },
    options?: WatermarkOptions,
  ): Promise<{ outPath: string }> {
    return this.call<{ out_path: string }>(
      "/delogo",
      { in_path: input.inPath, out_path: input.outPath, regions: input.regions },
      getVideoTimeoutMs(),
      options,
    ).then((r) => ({ outPath: r.out_path }));
  }
}
