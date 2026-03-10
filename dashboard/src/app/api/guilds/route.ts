import { NextResponse } from "next/server";
import { requireDashboardGuildAccess } from "@/lib/session";
import { getDashboardBotToken } from "@/lib/runtime-secrets";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await requireDashboardGuildAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const botToken = await getDashboardBotToken();
  if (!botToken) {
    return NextResponse.json(
      { error: "Missing bot token. Configure Step 3 in setup." },
      { status: 500 }
    );
  }

  const response = await fetch(`https://discord.com/api/v10/guilds/${access.guildId}`, {
    headers: {
      Authorization: `Bot ${botToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    let errorMessage = "Failed to fetch guilds";
    try {
      const errorBody = (await response.json()) as { message?: string };
      if (errorBody?.message) errorMessage = errorBody.message;
    } catch {
      // ignore parse errors
    }
    return NextResponse.json(
      { error: errorMessage },
      { status: response.status }
    );
  }

  const guild = (await response.json()) as {
    id: string;
    name: string;
    icon: string | null;
  };

  return NextResponse.json({
    guilds: [
      {
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
      },
    ],
  });
}
