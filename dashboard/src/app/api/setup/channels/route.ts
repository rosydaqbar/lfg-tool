import { NextResponse } from "next/server";
import {
  getGuildConfig,
  getSetupState,
  saveGuildConfig,
  getSetupSecretPayload,
  updateSetupState,
} from "@/lib/db";
import { decryptSetupValue } from "@/lib/setup-crypto";
import { requireSetupSession } from "@/lib/setup-session";

export const dynamic = "force-dynamic";

const TEXT_TYPES = new Set([0, 5]);

async function loadTextChannels(guildId: string, botToken: string) {
  const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
    headers: {
      Authorization: `Bot ${botToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch channels");
  }

  const channels = (await response.json()) as {
    id: string;
    name: string;
    type: number;
    position?: number;
  }[];

  return channels
    .filter((channel) => TEXT_TYPES.has(channel.type))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((channel) => ({ id: channel.id, name: channel.name }));
}

export async function GET() {
  const auth = await requireSetupSession();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const setup = await getSetupState();
  if (!setup.selectedGuildId) {
    return NextResponse.json({ error: "Guild is not configured" }, { status: 400 });
  }

  const secrets = await getSetupSecretPayload();
  if (!secrets.botTokenEncrypted && !secrets.botToken) {
    return NextResponse.json({ error: "Bot token is not configured" }, { status: 400 });
  }

  try {
    const botToken = secrets.botToken || decryptSetupValue(secrets.botTokenEncrypted as string);
    const textChannels = await loadTextChannels(setup.selectedGuildId, botToken);
    return NextResponse.json({ textChannels });
  } catch {
    return NextResponse.json({ error: "Failed to load text channels" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const auth = await requireSetupSession();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { logChannelId?: string; lfgChannelId?: string | null }
    | null;
  const logChannelId = (body?.logChannelId || "").trim();
  const lfgChannelId = typeof body?.lfgChannelId === "string" ? body.lfgChannelId.trim() : null;

  if (!logChannelId) {
    return NextResponse.json({ error: "logChannelId is required" }, { status: 400 });
  }

  const setup = await getSetupState();
  if (!setup.selectedGuildId) {
    return NextResponse.json({ error: "Guild is not configured" }, { status: 400 });
  }

  try {
    const existingConfig = await getGuildConfig(setup.selectedGuildId);
    await saveGuildConfig(setup.selectedGuildId, {
      logChannelId,
      lfgChannelId,
      enabledVoiceChannelIds: existingConfig.enabledVoiceChannelIds,
      joinToCreateLobbies: existingConfig.joinToCreateLobbies,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to save channels" },
      { status: 400 }
    );
  }

  await updateSetupState({
    logChannelId,
    lfgChannelId,
  });

  return NextResponse.json({ ok: true, setup: await getSetupState() });
}
