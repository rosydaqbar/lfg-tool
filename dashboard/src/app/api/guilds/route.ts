import { NextResponse } from "next/server";
import { getGuildConfig, getSetupState } from "@/lib/db";
import { getManageableDiscordGuilds } from "@/lib/session";
import type { DashboardManageableGuild } from "@/lib/session";
import { getDashboardBotToken } from "@/lib/runtime-secrets";

export const dynamic = "force-dynamic";

const BOT_INVITE_PERMISSIONS = "288427024";

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

async function isBotInstalled(guildId: string, botToken: string) {
  const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}`, {
    headers: {
      Authorization: `Bot ${botToken}`,
    },
    cache: "no-store",
  });
  return response.ok;
}

async function isGuildConfigured(guildId: string) {
  try {
    const config = await getGuildConfig(guildId);
    return Boolean(config.logChannelId);
  } catch {
    return false;
  }
}

async function hydrateGuild(guild: DashboardManageableGuild, botToken: string, clientId: string | null) {
  const botInstalled = await isBotInstalled(guild.id, botToken);
  const configured = botInstalled ? await isGuildConfigured(guild.id) : false;
  return {
    ...guild,
    botInstalled,
    configured,
    status: !botInstalled ? "invite_bot" : configured ? "ready" : "needs_setup",
    inviteUrl: !botInstalled && clientId ? createBotInviteUrl(clientId, guild.id) : null,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(10, Number(url.searchParams.get("limit") ?? 10) || 10));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);
  const selectedGuildId = (url.searchParams.get("selectedGuildId") ?? "").trim();

  const manageableGuilds = await getManageableDiscordGuilds();
  if (!Array.isArray(manageableGuilds)) {
    if (manageableGuilds.ok) {
      return NextResponse.json({ error: "Unexpected guild access result" }, { status: 500 });
    }
    return NextResponse.json(
      { error: manageableGuilds.error },
      { status: manageableGuilds.status }
    );
  }

  const botToken = await getDashboardBotToken();
  if (!botToken) {
    return NextResponse.json(
      { error: "Missing bot token. Configure Step 3 in setup." },
      { status: 500 }
    );
  }

  const setup = await getSetupState();
  const clientId = setup.discordClientId || process.env.DISCORD_CLIENT_ID || null;

  const pageGuilds = manageableGuilds.slice(offset, offset + limit);
  const selectedGuild = selectedGuildId
    ? manageableGuilds.find((guild) => guild.id === selectedGuildId) ?? null
    : null;
  const guildsToHydrate = selectedGuild
    ? [selectedGuild, ...pageGuilds.filter((guild) => guild.id !== selectedGuild.id)]
    : pageGuilds;
  const hydratedGuilds = await Promise.all(
    guildsToHydrate.map((guild) => hydrateGuild(guild, botToken, clientId))
  );
  const selectedHydratedGuild = selectedGuild
    ? hydratedGuilds.find((guild) => guild.id === selectedGuild.id) ?? null
    : null;
  const pageHydratedGuilds = pageGuilds
    .map((guild) => hydratedGuilds.find((item) => item.id === guild.id))
    .filter((guild): guild is NonNullable<typeof guild> => Boolean(guild));

  return NextResponse.json({
    guilds: pageHydratedGuilds,
    selectedGuild: selectedHydratedGuild,
    hasMore: offset + limit < manageableGuilds.length,
    nextOffset: offset + limit,
  });
}
