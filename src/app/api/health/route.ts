import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse<{ ok: true }>> {
  return NextResponse.json({ ok: true });
}

