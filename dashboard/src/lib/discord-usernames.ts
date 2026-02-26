import "@/lib/env";

type CacheEntry = {
  name: string | null;
  expiresAt: number;
};

const CACHE_TTL_MS = 10 * 60 * 1000;
const memberNameCache = new Map<string, CacheEntry>();

function getBotToken() {
  return process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN || null;
}

function pickMemberDisplayName(member: {
  nick?: string | null;
  user?: { global_name?: string | null; username?: string | null };
}) {
  return (
    member.nick ||
    member.user?.global_name ||
    member.user?.username ||
    null
  );
}

async function fetchGuildMemberName(guildId: string, userId: string) {
  const botToken = getBotToken();
  if (!botToken) return null;

  const response = await fetch(
    `https://discord.com/api/v10/guilds/${guildId}/members/${userId}`,
    {
      headers: {
        Authorization: `Bot ${botToken}`,
      },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    return null;
  }

  const member = (await response.json()) as {
    nick?: string | null;
    user?: { global_name?: string | null; username?: string | null };
  };
  return pickMemberDisplayName(member);
}

export async function resolveGuildUsernames(
  guildId: string,
  userIds: string[]
) {
  const now = Date.now();
  const uniqueIds = Array.from(
    new Set(userIds.map((id) => id.trim()).filter(Boolean))
  );

  const result = new Map<string, string | null>();
  const missingIds: string[] = [];

  for (const userId of uniqueIds) {
    const key = `${guildId}:${userId}`;
    const cached = memberNameCache.get(key);
    if (cached && cached.expiresAt > now) {
      result.set(userId, cached.name);
      continue;
    }
    missingIds.push(userId);
  }

  await Promise.allSettled(
    missingIds.map(async (userId) => {
      const name = await fetchGuildMemberName(guildId, userId);
      const key = `${guildId}:${userId}`;
      memberNameCache.set(key, {
        name,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      result.set(userId, name);
    })
  );

  return result;
}
