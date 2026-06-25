import { NextResponse } from "next/server";
import { errorResponse } from "@/application/errors";
import { previewPrompt } from "@/application/prompts/prompt-service";
import { parseBody } from "@/app/api/parse-body";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await parseBody(request);
    if (body instanceof NextResponse) return body;
    return NextResponse.json(await previewPrompt(body));
  } catch (error) {
    return errorResponse(error);
  }
}

