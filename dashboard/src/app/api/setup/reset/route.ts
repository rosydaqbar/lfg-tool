import { NextResponse } from "next/server";
import { getSetupState, updateSetupState } from "@/lib/db";
import { requireAdminSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireAdminSession();

  const body = (await request.json().catch(() => null)) as
    | { guildIdConfirm?: string }
    | null;
  const guildIdConfirm = (body?.guildIdConfirm || "").trim();

  const setup = await getSetupState();
  const currentGuildId = (setup.selectedGuildId || "").trim();

  if (!session && !setup.setupComplete) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!currentGuildId) {
    return NextResponse.json(
      { error: "No guild selected in current setup." },
      { status: 400 }
    );
  }

  if (!guildIdConfirm || guildIdConfirm !== currentGuildId) {
    return NextResponse.json(
      { error: "Guild ID confirmation does not match current setup guild." },
      { status: 400 }
    );
  }

  await updateSetupState({
    setupComplete: false,
    ownerDiscordId: null,
    ownerClaimedAt: null,
    discordClientId: null,
    discordClientSecretEncrypted: null,
    discordClientSecret: null,
    botTokenEncrypted: null,
    botToken: null,
    botDisplayName: null,
    selectedGuildId: null,
    logChannelId: null,
    lfgChannelId: null,
    databaseProvider: null,
    databaseUrlEncrypted: null,
    databaseUrl: null,
    databaseValidatedAt: null,
    setupAbandonedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, setup: await getSetupState() });
}
