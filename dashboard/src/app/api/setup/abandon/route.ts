import { NextResponse } from "next/server";
import { getSetupState, resetSetupDraft } from "@/lib/db";
import { requireSetupSession } from "@/lib/setup-session";

export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await requireSetupSession();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await resetSetupDraft();
  return NextResponse.json({ ok: true, setup: await getSetupState() });
}
