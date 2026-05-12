import { NextResponse } from "next/server";
import { getGuildConfig, getSetupState, updateSetupState } from "@/lib/db";
import { getDashboardBotToken } from "@/lib/runtime-secrets";
import { requireSetupSession } from "@/lib/setup-session";

export const dynamic = "force-dynamic";

const ADMINISTRATOR_PERMISSION_BIT = BigInt(8);
const BOT_INVITE_PERMISSIONS = "288427024";

type DiscordGuild = {
  id: string;
  name: string;
  icon?: string | null;
  owner?: boolean;
  permissions?: string;
};

function hasAdministratorPermission(permissionValue: string | number | bigint | null | undefined) {
  try {
    const value = BigInt(permissionValue ?? 0);
    return (value & ADMINISTRATOR_PERMISSION_BIT) === ADMINISTRATOR_PERMISSION_BIT;
  } catch {
    return false;
  }
}

function canManageGuild(guild: DiscordGuild) {
  return guild.owner === true || hasAdministratorPermission(guild.permissions);
}

function createBotInviteUrl(clientId: string, guildId: string) {
  const params = new URLSearchParams({
    client_id: clientId,
    permissions: BOT_INVITE_PERMISSIONS,
    scope: "bot applications.commands",
    guild_id: guildId,
    disable_guild_select: "true",
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

async function loadUserGuilds(accessToken: string) {
  const response = await fetch("https://discord.com/api/v10/users/@me/guilds", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    return {
      ok: false as const,
      status: response.status,
      error: payload?.message || "Failed to load Discord guilds",
    };
  }

  return { ok: true as const, guilds: (await response.json()) as DiscordGuild[] };
}

async function isBotInstalled(guildId: string, botToken: string | null) {
  if (!botToken) return false;
  const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}`, {
    headers: {
      Authorization: `Bot ${botToken}`,
    },
    cache: "no-store",
  }).catch(() => null);
  return response?.ok === true;
}

export async function GET() {
  const auth = await requireSetupSession();
  if (!auth?.session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const guildResult = await loadUserGuilds(auth.session.accessToken);
  if (!guildResult.ok) {
    return NextResponse.json({ error: guildResult.error }, { status: guildResult.status });
  }

  const setup = await getSetupState();
  const clientId = setup.discordClientId || process.env.DISCORD_CLIENT_ID || null;
  const botToken = await getDashboardBotToken();
  const manageableGuilds = guildResult.guilds.filter(canManageGuild);
  const guilds = [];

  for (const guild of manageableGuilds) {
    const botInstalled = await isBotInstalled(guild.id, botToken);
    let configured = false;
    if (botInstalled) {
      try {
        const config = await getGuildConfig(guild.id);
        configured = Boolean(config.logChannelId);
      } catch {
        configured = false;
      }
    }
    guilds.push({
      id: guild.id,
      name: guild.name,
      icon: guild.icon ?? null,
      accessLabel: guild.owner === true ? "Owner" : "Admin",
      botInstalled,
      configured,
      status: !botInstalled ? "invite_bot" : configured ? "ready" : "needs_setup",
      inviteUrl: !botInstalled && clientId ? createBotInviteUrl(clientId, guild.id) : null,
    });
  }

  return NextResponse.json({ guilds });
}

export async function POST(request: Request) {
  const auth = await requireSetupSession();
  if (!auth?.session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { guildId?: string }
    | null;
  const guildId = (body?.guildId || "").trim();

  if (!guildId) {
    return NextResponse.json({ error: "guildId is required" }, { status: 400 });
  }

  const guildResult = await loadUserGuilds(auth.session.accessToken);
  if (!guildResult.ok) {
    return NextResponse.json({ error: guildResult.error }, { status: guildResult.status });
  }

  const selectedGuild = guildResult.guilds.find((guild) => guild.id === guildId);
  if (!selectedGuild) {
    return NextResponse.json(
      { error: "Guild not found in your accessible guild list" },
      { status: 400 }
    );
  }

  if (!canManageGuild(selectedGuild)) {
    return NextResponse.json(
      { error: "You need Discord server owner or Administrator permission to set up this guild." },
      { status: 403 }
    );
  }

  let hydratedLogChannelId: string | null = null;
  let hydratedLfgChannelId: string | null = null;
  try {
    const existingConfig = await getGuildConfig(guildId);
    hydratedLogChannelId = existingConfig.logChannelId;
    hydratedLfgChannelId = existingConfig.lfgChannelId;
  } catch {
    hydratedLogChannelId = null;
    hydratedLfgChannelId = null;
  }

  await updateSetupState({
    selectedGuildId: guildId,
    logChannelId: hydratedLogChannelId,
    lfgChannelId: hydratedLfgChannelId,
  });
  const setup = await getSetupState();
  return NextResponse.json({ ok: true, guildName: selectedGuild.name, setup });
}
