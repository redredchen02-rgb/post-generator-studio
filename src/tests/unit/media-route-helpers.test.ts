import { describe, expect, it } from "vitest";
import { assertContentLength, sniffMedia } from "@/app/api/media/_shared";
import { errorResponse } from "@/app/api/api-helpers";
import { AppErrorException } from "@/domain/schemas";

function req(headers: Record<string, string>): Request {
  return new Request("http://x/api/media/x", { method: "POST", headers });
}

describe("assertContentLength", () => {
  it("accepts a length within the cap", () => {
    expect(() => assertContentLength(req({ "content-length": "1000" }))).not.toThrow();
  });

  it("rejects a missing Content-Length (blocks chunked bypass)", () => {
    expect(() => assertContentLength(req({}))).toThrow(AppErrorException);
  });

  it("rejects an oversized length before buffering", () => {
    expect(() => assertContentLength(req({ "content-length": String(10 * 1024 * 1024 * 1024) }))).toThrow(
      /上限/,
    );
  });
});

describe("sniffMedia", () => {
  it("identifies png/jpeg as image and rejects text", () => {
    expect(sniffMedia(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBe("image");
    expect(sniffMedia(Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0]))).toBe("image");
    expect(sniffMedia(Buffer.from("this is not media"))).toBe(null);
  });

  it("identifies mp4 ftyp as video", () => {
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42")]);
    expect(sniffMedia(mp4)).toBe("video");
  });
});

describe("errorResponse status fidelity", () => {
  it("maps sidecar/infra codes to their real HTTP status, not 400", () => {
    const cases: Array<[string, number]> = [
      ["SIDECAR_UNAVAILABLE", 503],
      ["WATERMARK_TIMEOUT", 504],
      ["FFMPEG_NOT_FOUND", 503],
      ["UPLOAD_TOO_LARGE", 413],
      ["LENGTH_REQUIRED", 411],
    ];
    for (const [code, status] of cases) {
      const res = errorResponse(new AppErrorException({ code, message: code }));
      expect(res.status).toBe(status);
    }
  });

  it("defaults unknown codes to 400", () => {
    const res = errorResponse(new AppErrorException({ code: "VALIDATION_ERROR", message: "x" }));
    expect(res.status).toBe(400);
  });
});
