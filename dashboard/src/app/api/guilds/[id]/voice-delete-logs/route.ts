import { NextResponse } from "next/server";
import { getTempVoiceDeleteLogs } from "@/lib/db";
import { resolveGuildUsernames } from "@/lib/discord-usernames";
import { requireAdminSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Number.parseInt(searchParams.get("limit") || "100", 10);
  const offset = Number.parseInt(searchParams.get("offset") || "0", 10);

  const rows = await getTempVoiceDeleteLogs(
    id,
    Number.isNaN(limit) ? 100 : limit,
    Number.isNaN(offset) ? 0 : offset
  );

  const allUserIds = rows.flatMap((row) => [
    row.ownerId,
    ...row.history.map((item) => item.userId),
  ]);
  const names = await resolveGuildUsernames(id, allUserIds);

  return NextResponse.json({
    deleteLogs: rows.map((row) => ({
      ...row,
      ownerName: names.get(row.ownerId) ?? null,
      history: row.history.map((item) => ({
        ...item,
        userName: names.get(item.userId) ?? null,
      })),
    })),
  });
}
