import { NextResponse } from "next/server";
import { errorResponse } from "@/app/api/api-helpers";
import { AppErrorException } from "@/domain/schemas";
import { restoreBackup } from "@/application/storage/backup-service";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { id?: unknown };
    if (typeof body.id !== "string" || body.id.length === 0) {
      throw new AppErrorException({ code: "VALIDATION_ERROR", message: "备份 ID 不能为空" });
    }
    await restoreBackup(body.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    // Validation errors map to 400; restore failures surface as plain Errors →
    // INTERNAL_ERROR → 500 via errorResponse's own code mapping.
    return errorResponse(error);
  }
}
