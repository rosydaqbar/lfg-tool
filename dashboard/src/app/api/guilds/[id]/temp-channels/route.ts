import { NextResponse } from "next/server";
import { getTempChannels } from "@/lib/db";
import { resolveGuildUsernames } from "@/lib/discord-usernames";
import { requireDashboardGuildAccess } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireDashboardGuildAccess(id);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const rows = await getTempChannels(id);
  const ownerNames = await resolveGuildUsernames(
    id,
    rows.map((row) => row.owner_id)
  );

  return NextResponse.json({
    tempChannels: rows.map((row) => ({
      channelId: row.channel_id,
      ownerId: row.owner_id,
      ownerName: ownerNames.get(row.owner_id) ?? null,
      createdAt: row.created_at,
      lfgChannelId: row.lfg_channel_id,
      lfgMessageId: row.lfg_message_id,
    })),
  });
}
