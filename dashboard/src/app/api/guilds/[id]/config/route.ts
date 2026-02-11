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
    joinToCreateLobbies: config.joinToCreateLobbies,
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
    joinToCreateLobbies?: { channelId?: string; roleId?: string }[];
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

  const joinToCreateLobbiesRaw = Array.isArray(body.joinToCreateLobbies)
    ? body.joinToCreateLobbies
    : [];
  const joinToCreateLobbies = Array.from(
    new Map(
      joinToCreateLobbiesRaw
        .filter(
          (item) =>
            item &&
            typeof item.channelId === "string" &&
            item.channelId.trim().length > 0
        )
        .map((item) => [
          item.channelId!.trim(),
          {
            channelId: item.channelId!.trim(),
            roleId: typeof item.roleId === "string" ? item.roleId.trim() : "",
          },
        ])
    ).values()
  );
  if (joinToCreateLobbies.some((item) => item.roleId.length === 0)) {
    return NextResponse.json(
      { error: "Each Join-to-Create lobby requires a role." },
      { status: 400 }
    );
  }

  try {
    await saveGuildConfig(id, {
      logChannelId: body.logChannelId,
      lfgChannelId,
      enabledVoiceChannelIds,
      joinToCreateLobbies,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
