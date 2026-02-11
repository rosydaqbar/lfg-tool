import { NextResponse } from "next/server";
import { getGuildConfig, saveGuildConfig } from "@/lib/db";
import { requireAdminSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await getGuildConfig(id);
  return NextResponse.json({
    logChannelId: config.logChannelId,
    lfgChannelId: config.lfgChannelId,
    enabledVoiceChannelIds: config.enabledVoiceChannelIds,
    joinToCreateLobbyIds: config.joinToCreateLobbyIds,
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    logChannelId?: string;
    lfgChannelId?: string | null;
    enabledVoiceChannelIds?: string[];
    joinToCreateLobbyIds?: string[];
  };

  if (!body.logChannelId) {
    return NextResponse.json(
      { error: "logChannelId is required" },
      { status: 400 }
    );
  }

  const lfgChannelId =
    typeof body.lfgChannelId === "string" ? body.lfgChannelId : null;

  const enabledVoiceChannelIds = Array.isArray(body.enabledVoiceChannelIds)
    ? Array.from(
        new Set(body.enabledVoiceChannelIds.filter((id) => typeof id === "string"))
      )
    : [];

  const joinToCreateLobbyIds = Array.isArray(body.joinToCreateLobbyIds)
    ? Array.from(
        new Set(body.joinToCreateLobbyIds.filter((id) => typeof id === "string"))
      )
    : [];

  try {
    await saveGuildConfig(id, {
      logChannelId: body.logChannelId,
      lfgChannelId,
      enabledVoiceChannelIds,
      joinToCreateLobbyIds,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
