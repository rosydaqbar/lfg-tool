import { NextResponse } from "next/server";
import { deleteTempChannelRecord, getTempChannels } from "@/lib/db";
import { resolveGuildUsernames } from "@/lib/discord-usernames";
import { getDashboardBotToken } from "@/lib/runtime-secrets";
import { requireDashboardGuildAccess } from "@/lib/session";

export const dynamic = "force-dynamic";

type DiscordChannel = {
  id: string;
  type: number;
};

function parseActiveUsers(
  value: unknown
): { userId: string; joinedAt: string | null }[] {
  const parsed = (() => {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
      try {
        const parsedValue = JSON.parse(value) as unknown;
        return Array.isArray(parsedValue) ? parsedValue : [];
      } catch {
        return [];
      }
    }
    return [];
  })();

  return parsed
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as { userId?: unknown; joinedAt?: unknown };
      if (typeof row.userId !== "string") return null;
      return {
        userId: row.userId,
        joinedAt: typeof row.joinedAt === "string" ? row.joinedAt : null,
      };
    })
    .filter((item): item is { userId: string; joinedAt: string | null } => item !== null);
}

async function fetchDiscordVoiceChannelIds(guildId: string, botToken: string | null) {
  if (!botToken) {
    return { ids: new Set<string>(), source: "unknown" as const };
  }

  const channelResponse = await fetch(
    `https://discord.com/api/v10/guilds/${guildId}/channels`,
    {
      headers: {
        Authorization: `Bot ${botToken}`,
      },
      cache: "no-store",
    }
  ).catch(() => null);

  if (!channelResponse?.ok) {
    return { ids: new Set<string>(), source: "unknown" as const };
  }

  const channels = (await channelResponse.json()) as DiscordChannel[];
  return {
    ids: new Set(
      channels
        .filter((channel) => channel.type === 2 || channel.type === 13)
        .map((channel) => channel.id)
    ),
    source: "discord_api" as const,
  };
}

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

  const botToken = await getDashboardBotToken();
  const { ids: existingVoiceChannelIds, source: availabilitySource } =
    await fetchDiscordVoiceChannelIds(id, botToken);

  const normalizedRows = rows.map((row) => ({
    ...row,
    activeUsers: parseActiveUsers(row.active_users),
  }));

  const allUserIds = new Set<string>();
  for (const row of normalizedRows) {
    allUserIds.add(row.owner_id);
    for (const user of row.activeUsers) {
      allUserIds.add(user.userId);
    }
  }

  const ownerNames = await resolveGuildUsernames(id, [...allUserIds]);

  return NextResponse.json({
    tempChannels: normalizedRows.map((row) => ({
      existsInDiscord:
        existingVoiceChannelIds.size > 0
          ? existingVoiceChannelIds.has(row.channel_id)
          : null,
      channelId: row.channel_id,
      ownerId: row.owner_id,
      ownerName: ownerNames.get(row.owner_id) ?? null,
      createdAt: row.created_at,
      lfgChannelId: row.lfg_channel_id,
      lfgMessageId: row.lfg_message_id,
      activeUsers:
        existingVoiceChannelIds.size > 0 && !existingVoiceChannelIds.has(row.channel_id)
          ? []
          : row.activeUsers.map((user) => ({
              userId: user.userId,
              userName: ownerNames.get(user.userId) ?? null,
              joinedAt: user.joinedAt,
            })),
      activeCount:
        existingVoiceChannelIds.size > 0 && !existingVoiceChannelIds.has(row.channel_id)
          ? 0
          : row.activeUsers.length,
      activeSource: "db",
      availabilitySource,
    })),
  });
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
    | { channelId?: string }
    | null;
  const channelId = (body?.channelId || "").trim();
  if (!channelId) {
    return NextResponse.json({ error: "channelId is required" }, { status: 400 });
  }

  const rows = await getTempChannels(id);
  const target = rows.find((row) => row.channel_id === channelId);
  if (!target) {
    return NextResponse.json({ error: "Temp channel record not found" }, { status: 404 });
  }

  const activeUsers = parseActiveUsers(target.active_users);
  const botToken = await getDashboardBotToken();
  const { ids: existingVoiceChannelIds } = await fetchDiscordVoiceChannelIds(id, botToken);

  const existsInDiscord =
    existingVoiceChannelIds.size > 0 ? existingVoiceChannelIds.has(channelId) : null;
  const isEmpty = activeUsers.length === 0;
  const allowed = existsInDiscord === false || (existsInDiscord === true && isEmpty);

  if (!allowed) {
    return NextResponse.json(
      {
        error:
          "Delete only allowed for Not found or Empty channels. Channel must be missing in Discord or have no active users.",
      },
      { status: 409 }
    );
  }

  let deletedInDiscord = false;
  let discordDeleteStatus: number | null = null;

  if (existsInDiscord === true && botToken) {
    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bot ${botToken}`,
      },
      cache: "no-store",
    }).catch(() => null);

    if (!response) {
      return NextResponse.json(
        { error: "Failed to reach Discord API while deleting channel" },
        { status: 502 }
      );
    }

    discordDeleteStatus = response.status;
    if (!response.ok && response.status !== 404) {
      const details = (await response.json().catch(() => null)) as { message?: string } | null;
      return NextResponse.json(
        { error: details?.message || "Failed to delete channel in Discord" },
        { status: response.status }
      );
    }
    deletedInDiscord = response.ok;
  }

  await deleteTempChannelRecord(channelId);

  return NextResponse.json({
    ok: true,
    channelId,
    deletedInDiscord,
    discordDeleteStatus,
    deletedRecord: true,
  });
}
