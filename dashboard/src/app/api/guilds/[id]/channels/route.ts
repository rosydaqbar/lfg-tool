import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const VOICE_TYPES = new Set([2, 13]);
const TEXT_TYPES = new Set([0, 5]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const botToken = process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json(
      { error: "Missing DISCORD_TOKEN" },
      { status: 500 }
    );
  }

  const response = await fetch(
    `https://discord.com/api/v10/guilds/${id}/channels`,
    {
      headers: {
        Authorization: `Bot ${botToken}`,
      },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    return NextResponse.json(
      { error: "Failed to fetch channels" },
      { status: response.status }
    );
  }

  const channels = (await response.json()) as {
    id: string;
    name: string;
    type: number;
    position?: number;
  }[];

  const voiceChannels = channels
    .filter((channel) => VOICE_TYPES.has(channel.type))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      type: channel.type === 13 ? "stage" : "voice",
    }));

  const textChannels = channels
    .filter((channel) => TEXT_TYPES.has(channel.type))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      type: channel.type === 5 ? "announcement" : "text",
    }));

  return NextResponse.json({ voiceChannels, textChannels });
}
