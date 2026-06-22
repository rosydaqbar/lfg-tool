import { NextResponse } from "next/server";
import { requireDashboardGuildAccess } from "@/lib/session";
import { getDashboardBotToken } from "@/lib/runtime-secrets";

export const dynamic = "force-dynamic";

const VOICE_TYPES = new Set([2, 13]);
const TEXT_TYPES = new Set([0, 5]);
const CHANNELS_CACHE_TTL_MS = 10 * 60_000;

type ChannelsPayload = {
  voiceChannels: { id: string; name: string; type: "voice" | "stage" }[];
  textChannels: { id: string; name: string; type: "text" | "announcement" }[];
};

const channelsCache = new Map<string, { expiresAt: number; payload: ChannelsPayload }>();
const channelsInFlight = new Map<string, Promise<ChannelsPayload>>();

async function loadDiscordChannels(guildId: string, botToken: string) {
  const cacheKey = `${guildId}:${botToken.slice(0, 12)}`;
  const now = Date.now();
  const cached = channelsCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.payload;

  const active = channelsInFlight.get(cacheKey);
  if (active) return active;

  const request = (async () => {
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/channels`,
      {
        headers: {
          Authorization: `Bot ${botToken}`,
        },
        cache: "no-store",
      }
    ).catch((error) => {
      console.error("Failed to fetch Discord guild channels:", error);
      return null;
    });

    if (!response) {
      if (cached) {
        console.warn("Using stale Discord channel cache after lookup failure:", { guildId });
        return cached.payload;
      }
      throw new Error("Discord channel lookup failed. Please retry.");
    }

    if (!response.ok) {
      const details = (await response.json().catch(() => null)) as { code?: number; message?: string } | null;
      if (response.status === 429 && cached) {
        console.warn("Using stale Discord channel cache after rate limit:", {
          guildId,
          code: details?.code,
          message: details?.message,
        });
        return cached.payload;
      }
      console.error("Discord guild channels error:", {
        guildId,
        status: response.status,
        code: details?.code,
        message: details?.message,
      });
      const error = new Error(details?.message || "Failed to fetch channels") as Error & {
        status?: number;
        code?: number | null;
      };
      error.status = response.status >= 500 ? 502 : response.status;
      error.code = details?.code ?? null;
      throw error;
    }

    const channels = (await response.json()) as {
      id: string;
      name: string;
      type: number;
      position?: number;
    }[];

    const payload = {
      voiceChannels: channels
        .filter((channel) => VOICE_TYPES.has(channel.type))
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((channel) => ({
          id: channel.id,
          name: channel.name,
          type: channel.type === 13 ? ("stage" as const) : ("voice" as const),
        })),
      textChannels: channels
        .filter((channel) => TEXT_TYPES.has(channel.type))
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((channel) => ({
          id: channel.id,
          name: channel.name,
          type: channel.type === 5 ? ("announcement" as const) : ("text" as const),
        })),
    } satisfies ChannelsPayload;

    channelsCache.set(cacheKey, {
      payload,
      expiresAt: Date.now() + CHANNELS_CACHE_TTL_MS,
    });
    return payload;
  })();

  channelsInFlight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    channelsInFlight.delete(cacheKey);
  }
}

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

  try {
    return NextResponse.json(await loadDiscordChannels(id, botToken));
  } catch (error) {
    const details = error as Error & { status?: number; code?: number | null };
    return NextResponse.json(
      { error: details.message || "Failed to fetch channels", code: details.code ?? null },
      { status: details.status ?? 502 }
    );
  }
}
