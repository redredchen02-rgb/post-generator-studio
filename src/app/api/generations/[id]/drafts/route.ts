import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/application/errors";
import { documentService } from "@/application/content/document-service";
import { getStorage } from "@/infrastructure/storage/sqlite-storage";
import { getOrThrow } from "@/application/crud-helpers";
import type { RouteContext } from "@/app/api/types";

export const runtime = "nodejs";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("autosave"), content: z.string() }),
  z.object({ action: z.literal("saveVersion"), label: z.string().min(1).optional() }),
  z.object({ action: z.literal("restore"), draftId: z.string().min(1) }),
]);

/** Drafts list + active pointer + effective content for the version switcher. */
export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const generation = await getOrThrow(getStorage().generations, id, "生成不存在");
    const [drafts, effectiveContent] = await Promise.all([
      documentService.listDrafts(id),
      documentService.getEffectiveContent(id),
    ]);
    return NextResponse.json({ drafts, activeDraftId: generation.activeDraftId ?? null, effectiveContent });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ error: { code: "INVALID_BODY", message: "请求体必须是合法 JSON" } }, { status: 400 });
    }
    const body = bodySchema.parse(raw);
    if (body.action === "autosave") {
      return NextResponse.json(await documentService.autosave(id, body.content));
    }
    if (body.action === "saveVersion") {
      return NextResponse.json(await documentService.saveVersion(id, body.label));
    }
    return NextResponse.json(await documentService.restoreVersion(id, body.draftId));
  } catch (error) {
    return errorResponse(error);
  }
}
