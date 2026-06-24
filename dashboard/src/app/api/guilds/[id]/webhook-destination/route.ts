import { NextResponse } from "next/server";
import { getDashboardBotToken } from "@/lib/runtime-secrets";
import { requireDashboardGuildAccess } from "@/lib/session";

function isDiscordWebhookUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (
      (host === "discord.com" || host === "discordapp.com") &&
      /^\/api\/webhooks\/\d+\/[A-Za-z0-9._-]+\/?$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

async function getDiscordChannelName(channelId: string) {
  const botToken = await getDashboardBotToken();
  if (!botToken) return null;
  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}`, {
    cache: "no-store",
    headers: { Authorization: `Bot ${botToken}` },
  }).catch(() => null);
  if (!response?.ok) return null;
  const channel = (await response.json().catch(() => null)) as { name?: string } | null;
  return typeof channel?.name === "string" && channel.name.length > 0 ? channel.name : null;
}

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireDashboardGuildAccess(id);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = (await request.json().catch(() => null)) as { webhookUrl?: string; channelId?: string } | null;
  const webhookUrl = typeof body?.webhookUrl === "string" ? body.webhookUrl.trim() : "";
  const expectedChannelId = typeof body?.channelId === "string" ? body.channelId.trim() : "";
  if (!webhookUrl || !isDiscordWebhookUrl(webhookUrl)) {
    return NextResponse.json({ error: "Enter a valid Discord webhook URL." }, { status: 400 });
  }

  const response = await fetch(webhookUrl, { cache: "no-store" }).catch((error) => {
    throw new Error(`Failed to check Discord webhook: ${error instanceof Error ? error.message : String(error)}`);
  });
  if (!response.ok) {
    return NextResponse.json(
      { error: `Discord webhook check failed (${response.status}). Make sure the webhook still exists and the URL includes its token.` },
      { status: 400 }
    );
  }

  const webhook = (await response.json().catch(() => null)) as {
    channel_id?: string;
    guild_id?: string;
    name?: string | null;
  } | null;
  if (!webhook?.channel_id) {
    return NextResponse.json(
      { error: "Discord webhook check did not return a destination channel." },
      { status: 400 }
    );
  }
  if (webhook.guild_id && webhook.guild_id !== id) {
    return NextResponse.json(
      { error: "That webhook belongs to a different Discord server." },
      { status: 400 }
    );
  }
  if (expectedChannelId && webhook.channel_id !== expectedChannelId) {
    return NextResponse.json(
      { error: `This webhook sends to <#${webhook.channel_id}>, not <#${expectedChannelId}>.` },
      { status: 400 }
    );
  }

  return NextResponse.json({
    channelId: webhook.channel_id,
    channelName: await getDiscordChannelName(webhook.channel_id),
    guildId: webhook.guild_id ?? null,
    webhookName: webhook.name ?? null,
  });
}
