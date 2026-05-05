import { NextResponse } from "next/server";
import { getGuildConfig, getSetupState } from "@/lib/db";
import { getManageableDiscordGuilds } from "@/lib/session";
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

export async function GET() {
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

  const guilds = [];
  for (const guild of manageableGuilds) {
    const botInstalled = await isBotInstalled(guild.id, botToken);
    const configured = botInstalled ? await isGuildConfigured(guild.id) : false;
    guilds.push({
      ...guild,
      botInstalled,
      configured,
      status: !botInstalled ? "invite_bot" : configured ? "ready" : "needs_setup",
      inviteUrl: !botInstalled && clientId ? createBotInviteUrl(clientId, guild.id) : null,
    });
  }

  return NextResponse.json({
    guilds,
  });
}
