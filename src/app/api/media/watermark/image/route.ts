import type { NextResponse } from "next/server";
import { errorResponse } from "@/application/errors";
import { imageWatermarkParamsSchema } from "@/domain/schemas";
import { watermarkImageJob } from "@/application/watermark/watermark-service";
import { assertContentLength, assertKind, fileResponse, fileToUpload, formObject, readMultipart } from "@/app/api/media/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertContentLength(request);
    const form = await readMultipart(request);
    const source = await fileToUpload(form.get("source"), "source");
    const watermark = await fileToUpload(form.get("watermark"), "watermark");
    assertKind(source, "image", "source");
    assertKind(watermark, "image", "watermark");
    const params = imageWatermarkParamsSchema.parse(formObject(form));
    const produced = await watermarkImageJob(source, watermark, params, request.signal);
    return fileResponse(produced);
  } catch (error) {
    return errorResponse(error);
  }
}
