import { NextResponse } from "next/server";
import { errorResponse } from "@/app/api/api-helpers";
import { snapshotRequestSchema } from "@/domain/schemas";
import { submitSnapshot } from "@/application/hotspot/hotspot-service";

export const runtime = "nodejs";

/** Submit a leaderboard snapshot to the stateful ranker; returns jump/drop/new alerts. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: "INVALID_BODY", message: "Request body must be valid JSON" } },
        { status: 400 },
      );
    }
    const { ranking } = snapshotRequestSchema.parse(raw);
    return NextResponse.json(await submitSnapshot(ranking, request.signal));
  } catch (error) {
    return errorResponse(error);
  }
}
