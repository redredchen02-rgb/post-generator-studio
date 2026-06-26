import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/application/errors";
import { scoreGeneration } from "@/application/quality/judge-service";
import type { RouteContext } from "@/app/api/types";

export const runtime = "nodejs";

const bodySchema = z.object({
  presetId: z.string().min(1).optional(),
  providerProfileId: z.string().min(1).optional(),
});

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ error: { code: "INVALID_BODY", message: "Request body must be valid JSON" } }, { status: 400 });
    }
    const opts = bodySchema.parse(raw ?? {});
    return NextResponse.json(await scoreGeneration(id, opts));
  } catch (error) {
    return errorResponse(error);
  }
}
