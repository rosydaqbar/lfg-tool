import { NextResponse } from "next/server";
import { getDashboardBotToken } from "@/lib/runtime-secrets";
import { requireDashboardGuildAccess } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const checkedAt = new Date().toISOString();
  const guildId = new URL(request.url).searchParams.get("guildId")?.trim() || "";

  if (!guildId) {
    return NextResponse.json({ error: "guildId is required" }, { status: 400 });
  }

  const access = await requireDashboardGuildAccess(guildId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

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

    let inSelectedGuild: boolean | null = null;
    const guildResponse = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}`,
      {
        method: "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bot ${botToken}`,
        },
      }
    );
    if (guildResponse.ok) {
      inSelectedGuild = true;
    } else if (guildResponse.status === 403 || guildResponse.status === 404) {
      inSelectedGuild = false;
    } else {
      inSelectedGuild = null;
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
      guildId,
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
