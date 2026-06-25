import { NextResponse } from "next/server";
import { errorResponse } from "@/application/errors";
import { cancelGeneration } from "@/application/generation/generation-service";
import type { RouteContext } from "@/app/api/types";

export const runtime = "nodejs";

export async function POST(_request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    return NextResponse.json(await cancelGeneration(id));
  } catch (error) {
    return errorResponse(error);
  }
}

