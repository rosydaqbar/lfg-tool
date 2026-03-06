import { NextResponse } from "next/server";
import { getSetupSecretPayload, getSetupState } from "@/lib/db";
import { decryptSetupValue } from "@/lib/setup-crypto";
import { requireSetupSession } from "@/lib/setup-session";

export const dynamic = "force-dynamic";

const REQUIRED_PERMISSIONS = "16781328";

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
    ? `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${REQUIRED_PERMISSIONS}&scope=bot%20applications.commands`
    : null;

  if (!guildId) {
    return NextResponse.json({ error: "Guild is not configured", inviteUrl }, { status: 400 });
  }

  const secrets = await getSetupSecretPayload();
  if (!secrets.botTokenEncrypted) {
    return NextResponse.json(
      { error: "Bot token is not configured", inviteUrl },
      { status: 400 }
    );
  }

  const botToken = decryptSetupValue(secrets.botTokenEncrypted);
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
