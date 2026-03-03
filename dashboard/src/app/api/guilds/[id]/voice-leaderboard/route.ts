import { NextResponse } from "next/server";
import { getTempVoiceDeleteLeaderboard } from "@/lib/db";
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
  const limit = Number.parseInt(searchParams.get("limit") || "20", 10);
  const offset = Number.parseInt(searchParams.get("offset") || "0", 10);

  const rows = await getTempVoiceDeleteLeaderboard(
    id,
    Number.isNaN(limit) ? 20 : limit,
    Number.isNaN(offset) ? 0 : offset
  );

  const names = await resolveGuildUsernames(
    id,
    rows.map((row) => row.userId)
  );

  return NextResponse.json({
    leaderboard: rows.map((row) => ({
      ...row,
      userName: names.get(row.userId) ?? null,
    })),
  });
}
