import { NextResponse } from "next/server";
import { errorResponse } from "@/application/errors";
import { deleteGeneration, getGeneration, updateGenerationContent } from "@/application/generation/generation-service";
import type { RouteContext } from "@/app/api/types";

export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    return NextResponse.json(await getGeneration(id));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { outputContent?: string };
    if (typeof body.outputContent !== "string") {
      return NextResponse.json({ error: "outputContent is required" }, { status: 400 });
    }
    return NextResponse.json(await updateGenerationContent(id, body.outputContent));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    await deleteGeneration(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}

