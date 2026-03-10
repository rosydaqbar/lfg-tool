import { NextResponse } from "next/server";
import { requireDashboardGuildAccess } from "@/lib/session";
import { getDashboardBotToken } from "@/lib/runtime-secrets";

export const dynamic = "force-dynamic";

const VOICE_TYPES = new Set([2, 13]);
const TEXT_TYPES = new Set([0, 5]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireDashboardGuildAccess(id);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const botToken = await getDashboardBotToken();
  if (!botToken) {
    return NextResponse.json(
      { error: "Missing bot token. Configure Step 3 in setup." },
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
    const details = (await response.json().catch(() => null)) as { message?: string } | null;
    return NextResponse.json(
      { error: details?.message || "Failed to fetch channels" },
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
