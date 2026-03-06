import { NextResponse } from "next/server";
import { getSetupState, updateSetupState } from "@/lib/db";
import { encryptSetupValue } from "@/lib/setup-crypto";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const setup = await getSetupState();
  if (setup.ownerDiscordId || setup.setupComplete) {
    return NextResponse.json(
      { error: "Setup is already initialized. Sign in to continue." },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { clientId?: string; clientSecret?: string }
    | null;

  const clientId = (body?.clientId || "").trim();
  const clientSecret = (body?.clientSecret || "").trim();

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "Discord Client ID and Client Secret are required" },
      { status: 400 }
    );
  }

  await updateSetupState({
    discordClientId: clientId,
    discordClientSecretEncrypted: encryptSetupValue(clientSecret),
  });

  return NextResponse.json({ ok: true, setup: await getSetupState() });
}
