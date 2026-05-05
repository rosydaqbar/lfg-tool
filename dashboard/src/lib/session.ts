import "./env";
import { getSetupState } from "@/lib/db";
import { getSafeServerSession } from "@/lib/safe-session";
import { getDashboardBotToken } from "@/lib/runtime-secrets";

const ADMINISTRATOR_PERMISSION_BIT = BigInt(8);

type SessionWithDiscord = {
  user?: { id?: string };
  accessToken?: string;
};

type GuildDetails = {
  id: string;
  owner_id?: string;
  name?: string;
  icon?: string | null;
};

type UserGuild = {
  id: string;
  name: string;
  icon?: string | null;
  owner?: boolean;
  permissions?: string;
};

type AccessCacheEntry = {
  expiresAt: number;
  result: DashboardGuildAccessResult;
};

type UserGuildsResult =
  | { ok: true; guilds: UserGuild[] }
  | { ok: false; status: number; error: string };

type UserGuildsCacheEntry = {
  expiresAt: number;
  result: UserGuildsResult;
};

type BotInstallCacheEntry = {
  expiresAt: number;
  installed: boolean;
};

type DashboardAccessCode =
  | "NOT_SIGNED_IN"
  | "SETUP_GUILD_MISSING"
  | "NOT_IN_GUILD"
  | "BOT_TOKEN_MISSING"
  | "GUILD_LOOKUP_FAILED"
  | "NO_ADMIN_ROLE";

const accessCache = new Map<string, AccessCacheEntry>();
const accessInFlight = new Map<string, Promise<DashboardGuildAccessResult>>();
const userGuildsCache = new Map<string, UserGuildsCacheEntry>();
const userGuildsInFlight = new Map<string, Promise<UserGuildsResult>>();
const botInstallCache = new Map<string, BotInstallCacheEntry>();
const botInstallInFlight = new Map<string, Promise<boolean>>();
const ACCESS_CACHE_TTL_MS = 60_000;
const USER_GUILDS_CACHE_TTL_MS = 5 * 60_000;
const USER_GUILDS_ERROR_CACHE_TTL_MS = 15_000;
const BOT_INSTALL_CACHE_TTL_MS = 60_000;

export type DashboardGuildAccessResult =
  | {
      ok: true;
      session: SessionWithDiscord;
      guildId: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
      code: DashboardAccessCode;
    };

export type DashboardManageableGuild = {
  id: string;
  name: string;
  icon: string | null;
  accessLabel: "Owner" | "Admin";
};

function deny(
  status: number,
  code: DashboardAccessCode,
  error: string
): DashboardGuildAccessResult {
  return { ok: false, status, code, error };
}

function hasAdministratorPermission(permissionValue: string | number | bigint | null | undefined) {
  try {
    const value = BigInt(permissionValue ?? 0);
    return (value & ADMINISTRATOR_PERMISSION_BIT) === ADMINISTRATOR_PERMISSION_BIT;
  } catch {
    return false;
  }
}

export function canManageDiscordGuild(guild: UserGuild) {
  return guild.owner === true || hasAdministratorPermission(guild.permissions);
}

async function fetchDiscordJson<T>(url: string, headers: HeadersInit) {
  const response = await fetch(url, {
    headers,
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as T | { message?: string } | null;
  return { response, payload };
}

async function getSessionUserGuilds(session: SessionWithDiscord): Promise<UserGuildsResult> {
  if (!session.accessToken) {
    return { ok: false, status: 401, error: "Sign in with Discord again so the dashboard can load your servers." };
  }

  const userId = session.user?.id;
  const cacheKey = userId || session.accessToken.slice(0, 24);
  const now = Date.now();
  const cached = userGuildsCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.result;
  }

  const active = userGuildsInFlight.get(cacheKey);
  if (active) return active;

  const request = (async (): Promise<UserGuildsResult> => {
    const result = await fetchDiscordJson<UserGuild[]>(
      "https://discord.com/api/v10/users/@me/guilds",
      {
        Authorization: `Bearer ${session.accessToken}`,
      }
    );

    if (!result.response.ok || !Array.isArray(result.payload)) {
      const payload = result.payload as { message?: string } | null;
      console.error("Discord user guilds error:", {
        status: result.response.status,
        message: payload?.message,
      });

      if (result.response.status === 429 && cached?.result.ok) {
        userGuildsCache.set(cacheKey, {
          result: cached.result,
          expiresAt: now + USER_GUILDS_ERROR_CACHE_TTL_MS,
        });
        return cached.result;
      }

      const errorResult: UserGuildsResult = {
        ok: false,
        status: result.response.status === 401 || result.response.status === 403 ? 401 : 502,
        error: result.response.status === 401 || result.response.status === 403
          ? "Sign in with Discord again so the dashboard can load your servers."
          : payload?.message || "Unable to load your Discord guilds. Please retry.",
      };
      userGuildsCache.set(cacheKey, {
        result: errorResult,
        expiresAt: now + USER_GUILDS_ERROR_CACHE_TTL_MS,
      });
      return errorResult;
    }

    const successResult: UserGuildsResult = { ok: true, guilds: result.payload };
    userGuildsCache.set(cacheKey, {
      result: successResult,
      expiresAt: now + USER_GUILDS_CACHE_TTL_MS,
    });
    return successResult;
  })();

  userGuildsInFlight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    userGuildsInFlight.delete(cacheKey);
  }
}

async function isBotInstalledInGuild(guildId: string, botToken: string) {
  const cacheKey = `${guildId}:${botToken.slice(0, 12)}`;
  const now = Date.now();
  const cached = botInstallCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.installed;

  const active = botInstallInFlight.get(cacheKey);
  if (active) return active;

  const request = (async () => {
    const result = await fetchDiscordJson<GuildDetails>(
      `https://discord.com/api/v10/guilds/${guildId}`,
      {
        Authorization: `Bot ${botToken}`,
      }
    );
    const installed = result.response.ok && Boolean(result.payload) && !Array.isArray(result.payload);
    botInstallCache.set(cacheKey, {
      installed,
      expiresAt: Date.now() + BOT_INSTALL_CACHE_TTL_MS,
    });
    return installed;
  })();

  botInstallInFlight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    botInstallInFlight.delete(cacheKey);
  }
}

export async function getManageableDiscordGuilds() {
  const session = (await getSafeServerSession()) as SessionWithDiscord | null;
  const userId = session?.user?.id;
  if (!session || !userId) {
    return deny(401, "NOT_SIGNED_IN", "Sign in with Discord to access dashboard.");
  }
  if (!session.accessToken) {
    return deny(401, "NOT_SIGNED_IN", "Sign in with Discord again so the dashboard can load your servers.");
  }

  const userGuilds = await getSessionUserGuilds(session);
  if (!userGuilds.ok) {
    return deny(userGuilds.status, userGuilds.status === 401 ? "NOT_SIGNED_IN" : "GUILD_LOOKUP_FAILED", userGuilds.error);
  }

  return userGuilds.guilds
    .filter(canManageDiscordGuild)
    .map((guild) => ({
      id: guild.id,
      name: guild.name,
      icon: guild.icon ?? null,
      accessLabel: guild.owner === true ? ("Owner" as const) : ("Admin" as const),
    }));
}

export async function requireDashboardGuildAccess(
  requestedGuildId?: string
): Promise<DashboardGuildAccessResult> {
  const session = (await getSafeServerSession()) as SessionWithDiscord | null;
  const userId = session?.user?.id;
  if (!session || !userId) {
    return deny(401, "NOT_SIGNED_IN", "Sign in with Discord to access dashboard.");
  }

  const guildId = (requestedGuildId || "").trim();
  if (!guildId) {
    return deny(400, "SETUP_GUILD_MISSING", "Select a guild before opening this dashboard.");
  }

  const cacheKey = `${userId}:${guildId}`;
  const now = Date.now();
  const cached = accessCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.result;
  }

  const activeCheck = accessInFlight.get(cacheKey);
  if (activeCheck) {
    return activeCheck;
  }

  const checkPromise = (async (): Promise<DashboardGuildAccessResult> => {
    if (!session.accessToken) {
      const result = deny(401, "NOT_SIGNED_IN", "Sign in with Discord again so the dashboard can verify this guild.");
      accessCache.set(cacheKey, { result, expiresAt: now + 5_000 });
      return result;
    }

    const userGuilds = await getSessionUserGuilds(session);
    if (!userGuilds.ok) {
      const result = deny(
        userGuilds.status,
        userGuilds.status === 401 ? "NOT_SIGNED_IN" : "GUILD_LOOKUP_FAILED",
        userGuilds.error
      );
      accessCache.set(cacheKey, { result, expiresAt: now + 5_000 });
      return result;
    }

    const userGuild = userGuilds.guilds.find((guild) => guild.id === guildId);
    if (!userGuild) {
      const result = deny(403, "NOT_IN_GUILD", "You cannot access this dashboard due to lack access.");
      accessCache.set(cacheKey, { result, expiresAt: now + 5_000 });
      return result;
    }

    if (!canManageDiscordGuild(userGuild)) {
      const result = deny(403, "NO_ADMIN_ROLE", "You cannot access this dashboard due to lack access.");
      accessCache.set(cacheKey, { result, expiresAt: now + 5_000 });
      return result;
    }

    const botToken = await getDashboardBotToken();
    if (!botToken) {
      const result = deny(
        500,
        "BOT_TOKEN_MISSING",
        "Bot token is missing. Configure setup before using dashboard."
      );
      accessCache.set(cacheKey, { result, expiresAt: now + 5_000 });
      return result;
    }

    const botInstalled = await isBotInstalledInGuild(guildId, botToken);
    if (!botInstalled) {
      const result = deny(
        403,
        "GUILD_LOOKUP_FAILED",
        "The bot is not installed in this guild yet. Invite the bot before opening settings."
      );
      accessCache.set(cacheKey, { result, expiresAt: now + 5_000 });
      return result;
    }

    const result = { ok: true, session, guildId } as const;
    accessCache.set(cacheKey, { result, expiresAt: now + ACCESS_CACHE_TTL_MS });
    return result;
  })();

  accessInFlight.set(cacheKey, checkPromise);
  try {
    return await checkPromise;
  } finally {
    accessInFlight.delete(cacheKey);
  }
}

export async function requireOwnerSession() {
  const session = await getSafeServerSession();
  const setup = await getSetupState();
  const ownerId = setup.ownerDiscordId?.trim();

  if (!session?.user?.id || !ownerId || session.user.id !== ownerId) {
    return null;
  }
  return session;
}
