import { NextResponse } from "next/server";
import { getSetupState, updateSetupState } from "@/lib/db";
import { requireSetupSession } from "@/lib/setup-session";

export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await requireSetupSession();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const setup = await getSetupState();
  if (
    !setup.ownerDiscordId ||
    !setup.discordClientId ||
    !setup.discordClientSecretSet ||
    !setup.botTokenSet ||
    !setup.selectedGuildId ||
    !setup.databaseValidatedAt ||
    !setup.logChannelId
  ) {
    return NextResponse.json(
      { error: "Complete all required setup steps first." },
      { status: 400 }
    );
  }

  await updateSetupState({ setupComplete: true });
  return NextResponse.json({ ok: true, setup: await getSetupState() });
}
