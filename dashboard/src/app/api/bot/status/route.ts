import { NextResponse } from "next/server";
import { getSetupState } from "@/lib/db";
import { getDashboardBotToken } from "@/lib/runtime-secrets";

export const dynamic = "force-dynamic";

export async function GET() {
  const checkedAt = new Date().toISOString();
  const botToken = await getDashboardBotToken();

  if (!botToken) {
    return NextResponse.json({
      online: null,
      status: "unverified",
      checkedAt,
      source: "discord_api",
      error: "Bot token is not configured.",
    });
  }

  try {
    const meResponse = await fetch("https://discord.com/api/v10/users/@me", {
      method: "GET",
      cache: "no-store",
      headers: {
        Authorization: `Bot ${botToken}`,
      },
    });

    if (!meResponse.ok) {
      let details = "Invalid bot token or Discord API rejected request.";
      try {
        const payload = (await meResponse.json()) as { message?: string };
        if (payload?.message) details = payload.message;
      } catch {
        // ignore parse errors
      }
      return NextResponse.json({
        online: false,
        status: "offline",
        checkedAt,
        source: "discord_api",
        error: details,
      });
    }

    const mePayload = (await meResponse.json()) as {
      id: string;
      username: string;
      discriminator?: string;
      global_name?: string | null;
    };

    const setup = await getSetupState();
    const guildId = (setup.selectedGuildId || "").trim();
    let inSelectedGuild: boolean | null = null;
    if (guildId) {
      const memberResponse = await fetch(
        `https://discord.com/api/v10/guilds/${guildId}/members/@me`,
        {
          method: "GET",
          cache: "no-store",
          headers: {
            Authorization: `Bot ${botToken}`,
          },
        }
      );
      inSelectedGuild = memberResponse.ok;
    }

    return NextResponse.json({
      online: true,
      status: "online",
      checkedAt,
      source: "discord_api",
      bot: {
        id: mePayload.id,
        username: mePayload.username,
        displayName: mePayload.global_name || mePayload.username,
      },
      guildId: guildId || null,
      inSelectedGuild,
    });
  } catch {
    return NextResponse.json({
      online: false,
      status: "offline",
      checkedAt,
      source: "discord_api",
      error: "Discord API status check failed",
    });
  }
}
