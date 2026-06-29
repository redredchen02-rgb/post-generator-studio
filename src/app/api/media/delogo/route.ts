import type { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/app/api/api-helpers";
import { detectRegionsSchema } from "@/domain/schemas";
import { delogoJob } from "@/application/watermark/watermark-service";
import { parseBody } from "@/app/api/parse-body";
import { assertContentLength, fileResponse } from "@/app/api/media/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Delogo references a prior detect job by its opaque jobId — no client path, no upload.
const bodySchema = z.object({
  jobId: z.string().uuid(),
  regions: detectRegionsSchema,
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertContentLength(request);
    const { jobId, regions } = bodySchema.parse(await parseBody(request));
    const produced = await delogoJob(jobId, regions, request.signal);
    return fileResponse(produced);
  } catch (error) {
    return errorResponse(error);
  }
}
