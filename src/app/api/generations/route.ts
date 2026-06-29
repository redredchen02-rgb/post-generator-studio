import { NextResponse } from "next/server";
import { errorResponse } from "@/app/api/api-helpers";
import { toAppError } from "@/application/errors";
import { listGenerations, streamGeneration } from "@/application/generation/generation-service";
import { generationListQuerySchema } from "@/domain/schemas";
import { parseBody } from "@/app/api/parse-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const parsed = generationListQuerySchema.parse(Object.fromEntries(url.searchParams.entries()));
    return NextResponse.json(await listGenerations({ search: parsed.search, offset: parsed.offset, limit: parsed.limit }));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await parseBody(request);
  } catch (error) {
    // parseBody throws AppErrorException on malformed JSON; without this catch the
    // throw escapes before the SSE stream is created and Next.js returns a bare 500
    // instead of the structured 400 INVALID_BODY that errorResponse produces.
    return errorResponse(error);
  }
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of streamGeneration(body)) {
          controller.enqueue(encoder.encode(sse(event.type, event)));
        }
      } catch (error) {
        controller.enqueue(encoder.encode(sse("error", { type: "error", error: toAppError(error) })));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

