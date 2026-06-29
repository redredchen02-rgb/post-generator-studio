import { NextResponse } from "next/server";
import { errorResponse } from "@/app/api/api-helpers";
import { AppErrorException } from "@/domain/schemas";
import { analyzeUploadedMedia } from "@/application/hotspot/content-service";
import { assertContentLength, fileToUpload, readMultipart, sniffMedia } from "@/app/api/media/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * NSFW / content safety check. Accepts an image OR video upload, sniffs the real
 * kind from magic bytes (rejecting unsupported types BEFORE the sidecar sees them),
 * and returns the per-frame verdicts. The file lives only in a temp job dir for the
 * duration of the request.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertContentLength(request);
    const form = await readMultipart(request);
    const source = await fileToUpload(form.get("source"), "source");
    const kind = sniffMedia(source.bytes);
    if (kind === null) {
      throw new AppErrorException({
        code: "VALIDATION_ERROR",
        message: "不支持的媒体类型（仅图片/视频）",
      });
    }
    const result = await analyzeUploadedMedia(source, kind, request.signal);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
