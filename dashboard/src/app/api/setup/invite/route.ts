import { NextResponse } from "next/server";
import { getSetupSecretPayload, getSetupState } from "@/lib/db";
import { decryptSetupValue } from "@/lib/setup-crypto";
import { requireSetupSession } from "@/lib/setup-session";

export const dynamic = "force-dynamic";

const BOT_INVITE_PERMISSIONS = "288427024";

function createBotInviteUrl(clientId: string, guildId?: string | null) {
  const params = new URLSearchParams({
    client_id: clientId,
    permissions: BOT_INVITE_PERMISSIONS,
    scope: "bot applications.commands",
  });
  if (guildId) {
    params.set("guild_id", guildId);
    params.set("disable_guild_select", "true");
  }
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

async function fetchBotIdentity(botToken: string) {
  const response = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bot ${botToken}` },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const user = (await response.json()) as { id?: string };
  return user.id ?? null;
}

export async function GET() {
  const auth = await requireSetupSession();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const setup = await getSetupState();
  const guildId = setup.selectedGuildId;
  const clientId = setup.discordClientId || process.env.DISCORD_CLIENT_ID || null;

  const inviteUrl = clientId
    ? createBotInviteUrl(clientId, guildId)
    : null;

  if (!guildId) {
    return NextResponse.json({ error: "Guild is not configured", inviteUrl }, { status: 400 });
  }

  const secrets = await getSetupSecretPayload();
  if (!secrets.botTokenEncrypted && !secrets.botToken) {
    return NextResponse.json(
      { error: "Bot token is not configured", inviteUrl },
      { status: 400 }
    );
  }

  let botToken = secrets.botToken || null;
  if (!botToken && secrets.botTokenEncrypted) {
    try {
      botToken = decryptSetupValue(secrets.botTokenEncrypted);
    } catch {
      return NextResponse.json({ error: "Failed to decrypt bot token" }, { status: 400 });
    }
  }
  if (!botToken) {
    return NextResponse.json({ error: "Bot token is not configured", inviteUrl }, { status: 400 });
  }

  const botId = await fetchBotIdentity(botToken);
  if (!botId) {
    return NextResponse.json({ error: "Invalid bot token", inviteUrl }, { status: 400 });
  }

  const membershipResponse = await fetch(
    `https://discord.com/api/v10/guilds/${guildId}/members/${botId}`,
    {
      headers: { Authorization: `Bot ${botToken}` },
      cache: "no-store",
    }
  );

  const alreadyInvited = membershipResponse.ok;

  return NextResponse.json({
    ok: true,
    inviteUrl,
    alreadyInvited,
  });
}
