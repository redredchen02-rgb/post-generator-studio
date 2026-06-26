import { NextResponse } from "next/server";
import { errorResponse } from "@/application/errors";
import {
  deleteProviderProfile,
  getProviderProfile,
  updateProviderProfile,
} from "@/application/providers/provider-service";
import type { RouteContext } from "@/app/api/types";
import { parseBody } from "@/app/api/parse-body";

export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    return NextResponse.json(await getProviderProfile(id));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const body = await parseBody(request);
    if (body instanceof NextResponse) return body;
    return NextResponse.json(await updateProviderProfile(id, body));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    await deleteProviderProfile(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}

