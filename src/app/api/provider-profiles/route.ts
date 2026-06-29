import { NextResponse } from "next/server";
import { errorResponse } from "@/app/api/api-helpers";
import { createProviderProfile, listProviderProfiles } from "@/application/providers/provider-service";
import { parseBody } from "@/app/api/parse-body";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(await listProviderProfiles());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await parseBody(request);
    if (body instanceof NextResponse) return body;
    return NextResponse.json(await createProviderProfile(body), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

