import { NextResponse } from "next/server";
import { getTempVoiceDeleteLogs } from "@/lib/db";
import { requireAdminSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await getTempVoiceDeleteLogs(id);
  return NextResponse.json({ deleteLogs: rows });
}
