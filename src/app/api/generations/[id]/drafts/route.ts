import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/application/errors";
import {
  listDrafts,
  getActiveDraftId,
  getEffectiveContent,
  autosave,
  saveVersion,
  restoreVersion,
} from "@/application/content/document-service";
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
    const [drafts, activeDraftId, effectiveContent] = await Promise.all([
      listDrafts(id),
      getActiveDraftId(id),
      getEffectiveContent(id),
    ]);
    return NextResponse.json({ drafts, activeDraftId, effectiveContent });
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
      return NextResponse.json(await autosave(id, body.content));
    }
    if (body.action === "saveVersion") {
      return NextResponse.json(await saveVersion(id, body.label));
    }
    return NextResponse.json(await restoreVersion(id, body.draftId));
  } catch (error) {
    return errorResponse(error);
  }
}
