import { NextResponse } from "next/server";
import { getSetupState, updateSetupState } from "@/lib/db";
import { requireSetupSession } from "@/lib/setup-session";

export const dynamic = "force-dynamic";

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

  const response = await fetch("https://discord.com/api/v10/users/@me/guilds", {
    headers: {
      Authorization: `Bearer ${auth.session.accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.json({ error: "Failed to load guilds" }, { status: response.status });
  }

  const guilds = (await response.json()) as { id: string; name: string }[];
  const selectedGuild = guilds.find((guild) => guild.id === guildId);
  if (!selectedGuild) {
    return NextResponse.json(
      { error: "Guild not found in your accessible guild list" },
      { status: 400 }
    );
  }

  await updateSetupState({ selectedGuildId: guildId });
  const setup = await getSetupState();
  return NextResponse.json({ ok: true, guildName: selectedGuild.name, setup });
}
