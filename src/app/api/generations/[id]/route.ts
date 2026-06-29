import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { errorResponse } from "@/app/api/api-helpers";
import { deleteGeneration, getGeneration, updateGenerationContent } from "@/application/generation/generation-service";
import type { RouteContext } from "@/app/api/types";

export const runtime = "nodejs";

const patchSchema = z.object({
  outputContent: z.string().min(1).max(500_000),
});

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
    const raw = await request.json();
    const parsed = patchSchema.safeParse(raw);
    if (!parsed.success) {
      return errorResponse(new ZodError(parsed.error.issues));
    }
    return NextResponse.json(await updateGenerationContent(id, parsed.data.outputContent));
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

