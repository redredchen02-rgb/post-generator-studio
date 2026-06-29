import { NextResponse } from "next/server";
import { errorResponse } from "@/app/api/api-helpers";
import { createBackup, listBackups } from "@/application/storage/backup-service";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(listBackups());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(): Promise<NextResponse> {
  try {
    const meta = await createBackup();
    return NextResponse.json(meta, { status: 201 });
  } catch (error) {
    // Backup failures surface as plain Errors → INTERNAL_ERROR → 500.
    return errorResponse(error);
  }
}
