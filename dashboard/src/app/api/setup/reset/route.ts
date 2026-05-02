import { NextResponse } from "next/server";
import { getSetupState, resetSetupDraft } from "@/lib/db";
import { requireOwnerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireOwnerSession();

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

  await resetSetupDraft();

  return NextResponse.json({ ok: true, setup: await getSetupState() });
}
