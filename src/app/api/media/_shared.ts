import { NextResponse } from "next/server";
import { AppErrorException } from "@/domain/schemas";
import type { ProducedFile, Upload } from "@/application/watermark/watermark-service";
import { contentDisposition } from "@/lib/content-disposition";

const DEFAULT_MAX_UPLOAD_BYTES = 200 * 1024 * 1024; // 200 MB

export function maxUploadBytes(): number {
  const raw = process.env.OMNIWM_MAX_UPLOAD_BYTES;
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_UPLOAD_BYTES;
}

/**
 * Reject oversized uploads BEFORE buffering the body. formData() reads the whole
 * request into memory, so checking size after parsing is too late (H1).
 *
 * A missing Content-Length is itself rejected: legit browser uploads always send
 * one, and accepting chunked/streamed bodies with no length would let an attacker
 * bypass this guard and force formData() to buffer an unbounded body (M2).
 */
export function assertContentLength(request: Request): void {
  const header = request.headers.get("content-length");
  if (header === null) {
    throw new AppErrorException({ code: "LENGTH_REQUIRED", message: "缺少 Content-Length" });
  }
  const len = Number(header);
  if (!Number.isFinite(len) || len < 0) {
    throw new AppErrorException({ code: "LENGTH_REQUIRED", message: "Content-Length 非法" });
  }
  if (len > maxUploadBytes()) {
    throw new AppErrorException({
      code: "UPLOAD_TOO_LARGE",
      message: `上传超出上限 ${Math.round(maxUploadBytes() / 1024 / 1024)}MB`,
    });
  }
}

/** Parse a multipart body, mapping a malformed/non-multipart body to a structured 400. */
export async function readMultipart(request: Request): Promise<FormData> {
  try {
    return await request.formData();
  } catch {
    throw new AppErrorException({ code: "INVALID_BODY", message: "请求体不是有效的 multipart 表单" });
  }
}

export async function fileToUpload(file: unknown, field: string): Promise<Upload> {
  if (!(file instanceof File)) {
    throw new AppErrorException({ code: "VALIDATION_ERROR", message: `缺少文件字段: ${field}` });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new AppErrorException({ code: "VALIDATION_ERROR", message: `${field} 为空文件` });
  }
  if (bytes.byteLength > maxUploadBytes()) {
    throw new AppErrorException({ code: "UPLOAD_TOO_LARGE", message: "上传超出上限" });
  }
  return { bytes, filename: file.name || field };
}

export type SniffKind = "image" | "video" | null;

/** Magic-byte sniff — extension is forgeable, so verify content before it reaches ffmpeg. */
export function sniffMedia(buf: Buffer): SniffKind {
  const b = buf.subarray(0, 16);
  const hex = (i: number) => b[i];
  // images
  if (hex(0) === 0xff && hex(1) === 0xd8 && hex(2) === 0xff) return "image"; // jpeg
  if (hex(0) === 0x89 && hex(1) === 0x50 && hex(2) === 0x4e && hex(3) === 0x47) return "image"; // png
  if (hex(0) === 0x47 && hex(1) === 0x49 && hex(2) === 0x46) return "image"; // gif
  if (hex(0) === 0x42 && hex(1) === 0x4d) return "image"; // bmp
  const ascii = b.toString("latin1");
  if (ascii.startsWith("RIFF") && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image";
  if (ascii.startsWith("RIFF") && buf.subarray(8, 11).toString("latin1") === "AVI") return "video";
  // videos
  if (buf.subarray(4, 8).toString("latin1") === "ftyp") return "video"; // mp4/mov/m4v
  if (hex(0) === 0x1a && hex(1) === 0x45 && hex(2) === 0xdf && hex(3) === 0xa3) return "video"; // mkv/webm
  if (ascii.startsWith("FLV")) return "video";
  return null;
}

export function assertKind(upload: Upload, expected: "image" | "video", field: string): void {
  const kind = sniffMedia(upload.bytes);
  if (kind !== expected) {
    throw new AppErrorException({
      code: "VALIDATION_ERROR",
      message: `${field} 内容不是有效的${expected === "image" ? "图片" : "视频"}（扩展名与内容不符？）`,
    });
  }
}

/** Collect the string fields of a multipart form into a plain object for zod. */
export function formObject(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

/** Stream a produced file back with a sanitized disposition + nosniff. */
export function fileResponse(produced: ProducedFile): NextResponse {
  return new NextResponse(produced.bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": produced.contentType,
      "Content-Disposition": contentDisposition(produced.filename),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
