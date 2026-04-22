import { NextResponse } from "next/server";
import { getSetupState, updateSetupState } from "@/lib/db";
import { encryptSetupValue } from "@/lib/setup-crypto";
import { requireSetupSession } from "@/lib/setup-session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireSetupSession();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const setup = await getSetupState();

  const body = (await request.json().catch(() => null)) as
    | { clientId?: string; clientSecret?: string }
    | null;

  const clientId = (body?.clientId || "").trim();
  const clientSecret = (body?.clientSecret || "").trim();

  if (!clientId) {
    return NextResponse.json(
      { error: "Discord Client ID is required" },
      { status: 400 }
    );
  }

  if (!clientSecret && !setup.discordClientSecretSet) {
    return NextResponse.json(
      { error: "Discord Client Secret is required" },
      { status: 400 }
    );
  }

  const nextState: Parameters<typeof updateSetupState>[0] = {
    discordClientId: clientId,
  };

  if (clientSecret) {
    const encryptedSecret = encryptSetupValue(clientSecret);
    nextState.discordClientSecretEncrypted = encryptedSecret;
    nextState.discordClientSecret = clientSecret;
  }

  await updateSetupState(nextState);

  return NextResponse.json({ ok: true, setup: await getSetupState() });
}

export async function DELETE() {
  const auth = await requireSetupSession();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await updateSetupState({
    discordClientId: null,
    discordClientSecretEncrypted: null,
    discordClientSecret: null,
  });

  return NextResponse.json({ ok: true, setup: await getSetupState() });
}
