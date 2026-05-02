import { NextResponse } from "next/server";
import {
  getTempChannels,
  getTempVoiceDeleteLogs,
  getVoiceAutoRoleRequestCounts,
  getVoiceAutoRoleRequests,
  getVoiceLeaderboardSummary,
  getVoiceLogTodayCount,
} from "@/lib/db";
import { resolveGuildUsernames } from "@/lib/discord-usernames";
import { getDashboardBotToken } from "@/lib/runtime-secrets";
import { requireDashboardGuildAccess } from "@/lib/session";

export const dynamic = "force-dynamic";

type ChannelNameCacheEntry = {
  name: string | null;
  expiresAt: number;
};

const CHANNEL_NAME_CACHE_TTL_MS = 10 * 60 * 1000;
const channelNameCache = new Map<string, ChannelNameCacheEntry>();

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

async function resolveChannelNames(guildId: string, channelIds: string[]) {
  const now = Date.now();
  const result = new Map<string, string | null>();
  const missingIds: string[] = [];

  for (const channelId of Array.from(new Set(channelIds.filter(Boolean)))) {
    const key = `${guildId}:${channelId}`;
    const cached = channelNameCache.get(key);
    if (cached && cached.expiresAt > now) {
      result.set(channelId, cached.name);
      continue;
    }
    missingIds.push(channelId);
  }

  if (!missingIds.length) return result;

  const botToken = await getDashboardBotToken();
  if (!botToken) return result;

  await Promise.allSettled(
    missingIds.slice(0, 3).map(async (channelId) => {
      const response = await fetch(`https://discord.com/api/v10/channels/${channelId}`, {
        headers: { Authorization: `Bot ${botToken}` },
        cache: "no-store",
      }).catch(() => null);
      const payload = response?.ok
        ? ((await response.json().catch(() => null)) as { name?: unknown } | null)
        : null;
      const name = typeof payload?.name === "string" ? payload.name : null;
      channelNameCache.set(`${guildId}:${channelId}`, {
        name,
        expiresAt: Date.now() + CHANNEL_NAME_CACHE_TTL_MS,
      });
      result.set(channelId, name);
    })
  );

  return result;
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

  const tempRows = await getTempChannels(id);
  const voiceLogs = await getTempVoiceDeleteLogs(id, 5, 0);
  const todayCount = await getVoiceLogTodayCount(id);
  const leaderboard = await getVoiceLeaderboardSummary(id);
  const requests = await getVoiceAutoRoleRequests(id, 3, 0);
  const pendingRequests = await getVoiceAutoRoleRequests(id, 3, 0, "pending");
  const counts = await getVoiceAutoRoleRequestCounts(id);

  const tempSummaryRows = tempRows.slice(0, 3).map((row) => ({
    row,
    activeUsers: parseActiveUsers(row.active_users),
  }));
  const userIds = [
    ...tempSummaryRows.flatMap(({ row, activeUsers }) => [
      row.owner_id,
      ...activeUsers.map((user) => user.userId),
    ]),
    ...voiceLogs.flatMap((log) => [
      log.ownerId,
      ...log.history.map((item) => item.userId),
    ]),
    ...leaderboard.top.map((row) => row.userId),
    ...requests.flatMap((request) => [request.userId, request.decidedBy || ""]),
    ...pendingRequests.flatMap((request) => [request.userId, request.decidedBy || ""]),
  ].filter((value) => value && value !== "server_owned");
  const names = await resolveGuildUsernames(id, userIds);
  const channelNames = await resolveChannelNames(
    id,
    tempSummaryRows
      .filter(({ row }) => !row.channel_name)
      .map(({ row }) => row.channel_id)
  );

  return NextResponse.json({
    tempChannels: tempSummaryRows.map(({ row, activeUsers }) => {
      return {
        channelId: row.channel_id,
        channelName: row.channel_name ?? channelNames.get(row.channel_id) ?? null,
        ownerId: row.owner_id,
        ownerName: row.owner_id === "server_owned" ? "server owned" : names.get(row.owner_id) ?? null,
        createdAt: row.created_at,
        activeCount: activeUsers.length,
      };
    }),
    tempChannelCount: tempRows.length,
    voiceLogs: voiceLogs.map((log) => ({
      ...log,
      ownerName: log.ownerId === "server_owned" ? "server owned" : names.get(log.ownerId) ?? null,
      history: log.history.map((item) => ({
        ...item,
        userName: names.get(item.userId) ?? null,
      })),
    })),
    voiceLogSummary: {
      todayCount,
      timezone: "Asia/Jakarta",
    },
    leaderboard: {
      ...leaderboard,
      top: leaderboard.top.map((row) => ({
        ...row,
        userName: names.get(row.userId) ?? null,
      })),
    },
    requests: requests.map((request) => ({
      ...request,
      userName: names.get(request.userId) ?? null,
      decidedByName: request.decidedBy ? names.get(request.decidedBy) ?? null : null,
    })),
    pendingRequests: pendingRequests.map((request) => ({
      ...request,
      userName: names.get(request.userId) ?? null,
      decidedByName: request.decidedBy ? names.get(request.decidedBy) ?? null : null,
    })),
    counts,
  });
}
