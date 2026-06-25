import { NextResponse } from "next/server";
import { errorResponse, toAppError } from "@/application/errors";
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
    return NextResponse.json(await listGenerations(parsed.limit));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = await parseBody(request);
  if (body instanceof NextResponse) return body;
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

