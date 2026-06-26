import { NextResponse } from "next/server";
import { errorResponse } from "@/application/errors";
import { AppErrorException } from "@/domain/schemas";
import { deleteBackup } from "@/application/storage/backup-service";
import type { RouteContext } from "@/app/api/types";

export const runtime = "nodejs";

export async function DELETE(_request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    if (!deleteBackup(id)) {
      throw new AppErrorException({ code: "NOT_FOUND", message: "备份不存在" });
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
