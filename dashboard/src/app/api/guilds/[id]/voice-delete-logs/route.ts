import { NextResponse } from "next/server";
import {
  getTempVoiceDeleteLeaderboard,
  getTempVoiceDeleteLogs,
  getVoiceLogTodayCount,
} from "@/lib/db";
import { resolveGuildUsernames } from "@/lib/discord-usernames";
import { requireDashboardGuildAccess } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireDashboardGuildAccess(id);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { searchParams } = new URL(request.url);
  const limit = Number.parseInt(searchParams.get("limit") || "100", 10);
  const offset = Number.parseInt(searchParams.get("offset") || "0", 10);
  const includeLeaderboard = searchParams.get("includeLeaderboard") === "1";
  const includeSummary = searchParams.get("summary") === "1";
  const leaderboardLimit = Number.parseInt(
    searchParams.get("leaderboardLimit") || "20",
    10
  );
  const leaderboardOffset = Number.parseInt(
    searchParams.get("leaderboardOffset") || "0",
    10
  );

  const rows = await getTempVoiceDeleteLogs(
    id,
    Number.isNaN(limit) ? 100 : limit,
    Number.isNaN(offset) ? 0 : offset
  );

  const leaderboardRows = includeLeaderboard
    ? await getTempVoiceDeleteLeaderboard(
        id,
        Number.isNaN(leaderboardLimit) ? 20 : leaderboardLimit,
        Number.isNaN(leaderboardOffset) ? 0 : leaderboardOffset
      )
    : [];

  const allUserIds = rows.flatMap((row) => [
    row.ownerId,
    ...row.history.map((item) => item.userId),
  ]);
  const leaderboardUserIds = leaderboardRows.map((row) => row.userId);
  const resolvableIds = [...allUserIds, ...leaderboardUserIds].filter(
    (value) => value !== "server_owned"
  );
  const names = await resolveGuildUsernames(id, resolvableIds);

  return NextResponse.json({
    deleteLogs: rows.map((row) => ({
      ...row,
      ownerName:
        row.ownerId === "server_owned"
          ? "server owned"
          : names.get(row.ownerId) ?? null,
      history: row.history.map((item) => ({
        ...item,
        userName: names.get(item.userId) ?? null,
      })),
    })),
    leaderboard: leaderboardRows.map((row) => ({
      ...row,
      userName: names.get(row.userId) ?? null,
    })),
    summary: includeSummary
      ? {
          todayCount: await getVoiceLogTodayCount(id),
          timezone: "Asia/Jakarta",
        }
      : undefined,
  });
}
