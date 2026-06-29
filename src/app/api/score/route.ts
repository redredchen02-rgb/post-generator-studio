import { NextResponse } from "next/server";
import { errorResponse } from "@/app/api/api-helpers";
import { draftScoreRequestSchema } from "@/domain/schemas";
import { scoreCopyLocal } from "@/application/quality/local-score-service";

export const runtime = "nodejs";

/**
 * Stateless draft scoring: score arbitrary copy without a generation row. Used for
 * instant feedback while editing. No DB read or write. The `text` length is capped
 * in the schema — debounce on the client is UX, not a rate limit.
 */
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
    const { text } = draftScoreRequestSchema.parse(raw);
    return NextResponse.json(await scoreCopyLocal(text, request.signal));
  } catch (error) {
    return errorResponse(error);
  }
}
