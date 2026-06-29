import type { NextResponse } from "next/server";
import { errorResponse } from "@/app/api/api-helpers";
import { videoWatermarkParamsSchema } from "@/domain/schemas";
import { watermarkVideoJob } from "@/application/watermark/watermark-service";
import { assertContentLength, assertKind, fileResponse, fileToUpload, formObject, readMultipart } from "@/app/api/media/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertContentLength(request);
    const form = await readMultipart(request);
    const source = await fileToUpload(form.get("source"), "source");
    const watermark = await fileToUpload(form.get("watermark"), "watermark");
    assertKind(source, "video", "source");
    assertKind(watermark, "image", "watermark");
    const params = videoWatermarkParamsSchema.parse(formObject(form));

    let wmfile2;
    if (params.wmMode === "diagonal") {
      wmfile2 = await fileToUpload(form.get("watermark2"), "watermark2");
      assertKind(wmfile2, "image", "watermark2");
    }
    const produced = await watermarkVideoJob(source, watermark, params, request.signal, wmfile2);
    return fileResponse(produced);
  } catch (error) {
    return errorResponse(error);
  }
}
