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

  const encryptedSecret = encryptSetupValue(clientSecret);
  await updateSetupState({
    discordClientId: clientId,
    discordClientSecretEncrypted: encryptedSecret,
    discordClientSecret: clientSecret,
  });

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
