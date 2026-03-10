import "@/lib/env";
import { getSetupState } from "@/lib/db";
import { getSafeServerSession } from "@/lib/safe-session";
import { getDashboardBotToken } from "@/lib/runtime-secrets";

const ADMINISTRATOR_PERMISSION_BIT = BigInt(8);

type SessionWithDiscord = {
  user?: { id?: string };
};

type GuildMember = {
  roles?: string[];
};

type GuildDetails = {
  id: string;
  owner_id?: string;
  name?: string;
  icon?: string | null;
};

type GuildRole = {
  id: string;
  permissions: string;
};

type AccessCacheEntry = {
  expiresAt: number;
  result: DashboardGuildAccessResult;
};

type DashboardAccessCode =
  | "NOT_SIGNED_IN"
  | "SETUP_GUILD_MISSING"
  | "GUILD_MISMATCH"
  | "NOT_IN_GUILD"
  | "BOT_TOKEN_MISSING"
  | "GUILD_LOOKUP_FAILED"
  | "MEMBER_LOOKUP_FAILED"
  | "ROLE_LOOKUP_FAILED"
  | "NO_ADMIN_ROLE";

const accessCache = new Map<string, AccessCacheEntry>();
const accessInFlight = new Map<string, Promise<DashboardGuildAccessResult>>();
const ACCESS_CACHE_TTL_MS = 60_000;

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

async function fetchDiscordJson<T>(url: string, headers: HeadersInit) {
  const response = await fetch(url, {
    headers,
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as T | { message?: string } | null;
  return { response, payload };
}

export async function requireDashboardGuildAccess(
  requestedGuildId?: string
): Promise<DashboardGuildAccessResult> {
  const session = (await getSafeServerSession()) as SessionWithDiscord | null;
  const userId = session?.user?.id;
  if (!session || !userId) {
    return deny(401, "NOT_SIGNED_IN", "Sign in with Discord to access dashboard.");
  }

  const setup = await getSetupState();
  const setupGuildId = (setup.selectedGuildId || "").trim();
  if (!setupGuildId) {
    return deny(400, "SETUP_GUILD_MISSING", "Setup guild is not configured. Complete setup first.");
  }

  if (requestedGuildId && requestedGuildId !== setupGuildId) {
    return deny(403, "GUILD_MISMATCH", "You cannot access this dashboard due to lack access.");
  }

  const cacheKey = `${userId}:${setupGuildId}`;
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
    const botToken = await getDashboardBotToken();
    if (!botToken) {
      const result = deny(
        500,
        "BOT_TOKEN_MISSING",
        "Bot token is missing. Configure Step 3 in setup before using dashboard."
      );
      accessCache.set(cacheKey, { result, expiresAt: now + 5_000 });
      return result;
    }

    const memberResult = await fetchDiscordJson<GuildMember>(
      `https://discord.com/api/v10/guilds/${setupGuildId}/members/${userId}`,
      {
        Authorization: `Bot ${botToken}`,
      }
    );

    if (!memberResult.response.ok || !memberResult.payload || Array.isArray(memberResult.payload)) {
      const status = memberResult.response.status === 404 ? 403 : 500;
      const result = deny(
        status,
        memberResult.response.status === 404 ? "NOT_IN_GUILD" : "MEMBER_LOOKUP_FAILED",
        memberResult.response.status === 429
          ? "Discord is rate limiting requests. Please wait a minute and retry."
          : memberResult.response.status === 404
            ? "You cannot access this dashboard due to lack access."
            : "Unable to verify your guild member roles. Check bot access and permissions."
      );
      const previous = accessCache.get(cacheKey);
      if (!result.ok && result.status === 429 && previous?.result.ok) {
        return previous.result;
      }
      accessCache.set(cacheKey, { result, expiresAt: now + 5_000 });
      return result;
    }

    const guildResult = await fetchDiscordJson<GuildDetails>(
      `https://discord.com/api/v10/guilds/${setupGuildId}`,
      {
        Authorization: `Bot ${botToken}`,
      }
    );

    if (!guildResult.response.ok || !guildResult.payload || Array.isArray(guildResult.payload)) {
      const result = deny(
        guildResult.response.status === 429 ? 429 : 500,
        "GUILD_LOOKUP_FAILED",
        guildResult.response.status === 429
          ? "Discord is rate limiting requests. Please wait a minute and retry."
          : "Unable to verify guild details. Check bot access and permissions."
      );
      const previous = accessCache.get(cacheKey);
      if (!result.ok && result.status === 429 && previous?.result.ok) {
        return previous.result;
      }
      accessCache.set(cacheKey, { result, expiresAt: now + 5_000 });
      return result;
    }

    const guildPayload = guildResult.payload as GuildDetails;
    if (guildPayload.owner_id && guildPayload.owner_id === userId) {
      const result = { ok: true, session, guildId: setupGuildId } as const;
      accessCache.set(cacheKey, { result, expiresAt: now + ACCESS_CACHE_TTL_MS });
      return result;
    }

    const memberPayload = memberResult.payload as GuildMember;

    const memberRoles = new Set(
      Array.isArray(memberPayload.roles) ? memberPayload.roles : []
    );
    if (memberRoles.size === 0) {
      const result = deny(403, "NO_ADMIN_ROLE", "You cannot access this dashboard due to lack access.");
      accessCache.set(cacheKey, { result, expiresAt: now + 5_000 });
      return result;
    }

    const rolesResult = await fetchDiscordJson<GuildRole[]>(
      `https://discord.com/api/v10/guilds/${setupGuildId}/roles`,
      {
        Authorization: `Bot ${botToken}`,
      }
    );

    if (!rolesResult.response.ok || !Array.isArray(rolesResult.payload)) {
      const result = deny(
        rolesResult.response.status === 429 ? 429 : 500,
        "ROLE_LOOKUP_FAILED",
        rolesResult.response.status === 429
          ? "Discord is rate limiting requests. Please wait a minute and retry."
          : "Unable to verify role permissions. Check bot access and permissions."
      );
      const previous = accessCache.get(cacheKey);
      if (!result.ok && result.status === 429 && previous?.result.ok) {
        return previous.result;
      }
      accessCache.set(cacheKey, { result, expiresAt: now + 5_000 });
      return result;
    }

    const hasAdminRole = rolesResult.payload.some(
      (role) => memberRoles.has(role.id) && hasAdministratorPermission(role.permissions)
    );

    if (!hasAdminRole) {
      const result = deny(403, "NO_ADMIN_ROLE", "You cannot access this dashboard due to lack access.");
      accessCache.set(cacheKey, { result, expiresAt: now + 5_000 });
      return result;
    }

    const result = { ok: true, session, guildId: setupGuildId } as const;
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

export async function requireAdminSession() {
  const session = await getSafeServerSession();
  let adminId = process.env.ADMIN_DISCORD_USER_ID;
  if (!adminId) {
    const setup = await getSetupState();
    adminId = setup.ownerDiscordId ?? adminId;
  }
  if (!session || !adminId || session.user?.id !== adminId) {
    return null;
  }
  return session;
}
