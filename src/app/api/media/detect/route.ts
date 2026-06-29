import { NextResponse } from "next/server";
import { errorResponse } from "@/application/errors";
import { detectJob } from "@/application/watermark/watermark-service";
import { assertContentLength, assertKind, fileToUpload, readMultipart } from "@/app/api/media/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertContentLength(request);
    const form = await readMultipart(request);
    const source = await fileToUpload(form.get("source"), "source");
    assertKind(source, "video", "source");
    const result = await detectJob(source, request.signal);
    // jobId is the opaque server-side session handle for a follow-up delogo.
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
