import { NextResponse } from "next/server";
import {
  deleteVoiceLeaderboardEntry,
  getTempVoiceDeleteLeaderboard,
  upsertVoiceLeaderboardEntry,
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

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireDashboardGuildAccess(id);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = (await request.json().catch(() => null)) as
    | { userId?: string; totalMs?: number; sessions?: number }
    | null;

  const userId = (body?.userId || "").trim();
  const totalMs = Number(body?.totalMs);
  const sessions = Number(body?.sessions);

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }
  if (!Number.isFinite(totalMs) || totalMs < 0) {
    return NextResponse.json({ error: "totalMs must be >= 0" }, { status: 400 });
  }
  if (!Number.isFinite(sessions) || sessions < 0) {
    return NextResponse.json({ error: "sessions must be >= 0" }, { status: 400 });
  }

  await upsertVoiceLeaderboardEntry(id, userId, Math.floor(totalMs), Math.floor(sessions));
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireDashboardGuildAccess(id);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = (await request.json().catch(() => null)) as
    | { userId?: string }
    | null;
  const userId = (body?.userId || "").trim();

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  await deleteVoiceLeaderboardEntry(id, userId);
  return NextResponse.json({ ok: true });
}
