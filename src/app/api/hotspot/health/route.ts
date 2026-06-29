import { NextResponse } from "next/server";
import { errorResponse } from "@/app/api/api-helpers";
import { getHotspotHealth } from "@/application/quality/local-score-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const health = await getHotspotHealth(request.signal);
    return NextResponse.json(health);
  } catch (error) {
    // Sidecar down is an expected, recoverable state — report it as a body, not a 5xx throw.
    return errorResponse(error, 503);
  }
}
