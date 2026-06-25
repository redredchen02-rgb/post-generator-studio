import { NextResponse } from "next/server";
import { errorResponse } from "@/application/errors";
import { completeText } from "@/application/content/completion-service";
import { parseBody } from "@/app/api/parse-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await parseBody(request);
    return NextResponse.json(await completeText(body));
  } catch (error) {
    return errorResponse(error);
  }
}
