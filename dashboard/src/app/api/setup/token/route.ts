import { NextResponse } from "next/server";
import { getSetupState, updateSetupState } from "@/lib/db";
import { encryptSetupValue } from "@/lib/setup-crypto";
import { requireSetupSession } from "@/lib/setup-session";

export const dynamic = "force-dynamic";

async function validateBotToken(token: string) {
  const response = await fetch("https://discord.com/api/v10/users/@me", {
    headers: {
      Authorization: `Bot ${token}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return { ok: false, message: "Invalid bot token" };
  }

  const user = (await response.json()) as {
    id?: string;
    username?: string;
    global_name?: string | null;
    discriminator?: string;
  };
  if (!user?.id) {
    return { ok: false, message: "Failed to validate bot identity" };
  }

  const tag = user.discriminator && user.discriminator !== "0"
    ? `${user.username}#${user.discriminator}`
    : user.username;
  const displayName = user.global_name || user.username || user.id;

  return {
    ok: true,
    botId: user.id,
    botName: displayName,
    botTag: tag || user.id,
  };
}

export async function POST(request: Request) {
  const auth = await requireSetupSession();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { token?: string }
    | null;
  const token = (body?.token || "").trim();

  if (!token) {
    return NextResponse.json({ error: "Token is required" }, { status: 400 });
  }

  const check = await validateBotToken(token);
  if (!check.ok) {
    return NextResponse.json({ error: check.message }, { status: 400 });
  }

  const encrypted = encryptSetupValue(token);
  await updateSetupState({
    botTokenEncrypted: encrypted,
    botToken: token,
    botDisplayName: check.botTag || check.botName,
  });

  const setup = await getSetupState();
  return NextResponse.json({
    ok: true,
    botName: check.botName,
    botTag: check.botTag,
    setup,
  });
}
