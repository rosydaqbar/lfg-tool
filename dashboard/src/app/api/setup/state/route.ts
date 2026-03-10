import { NextResponse } from "next/server";
import { getSetupState, updateSetupState } from "@/lib/db";
import { requireSetupSession } from "@/lib/setup-session";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireSetupSession();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const setup = await getSetupState();
  return NextResponse.json({
    setup,
    currentUserId: auth.session.user?.id ?? null,
  });
}

export async function POST(request: Request) {
  const auth = await requireSetupSession();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { action?: string }
    | null;

  if (body?.action !== "claim_owner") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const currentState = await getSetupState();
  if (currentState.ownerDiscordId && currentState.ownerDiscordId !== auth.session.user?.id) {
    return NextResponse.json({ error: "Owner already claimed" }, { status: 403 });
  }

  await updateSetupState({
    ownerDiscordId: auth.session.user?.id ?? null,
    ownerClaimedAt: new Date().toISOString(),
  });

  const setup = await getSetupState();
  return NextResponse.json({ setup });
}
