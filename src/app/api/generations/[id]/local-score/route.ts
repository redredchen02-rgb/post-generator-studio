import { NextResponse } from "next/server";
import { errorResponse } from "@/app/api/api-helpers";
import { scoreGenerationLocal } from "@/application/quality/local-score-service";
import type { RouteContext } from "@/app/api/types";

export const runtime = "nodejs";

/** Local vocabulary score for a generation's current output. Computed on demand, not persisted. */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    return NextResponse.json(await scoreGenerationLocal(id, request.signal));
  } catch (error) {
    return errorResponse(error);
  }
}
