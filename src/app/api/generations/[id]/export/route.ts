import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/application/errors";
import { exportGeneration } from "@/application/export/export-service";
import type { RouteContext } from "@/app/api/types";

export const runtime = "nodejs";

const querySchema = z.object({
  format: z.enum(["md", "txt"]).default("md"),
});

export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const url = new URL(request.url);
    const { format } = querySchema.parse(Object.fromEntries(url.searchParams.entries()));
    const exported = await exportGeneration(id, format);
    return new NextResponse(exported.content, {
      headers: {
        "Content-Type": format === "md" ? "text/markdown; charset=utf-8" : "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exported.filename}"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

