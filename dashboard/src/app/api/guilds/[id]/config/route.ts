import { NextResponse } from "next/server";
import {
  getGuildConfig,
  getSpamCatcherCaughtUserCounts,
  saveGuildConfig,
  saveSpamCatcherNoticeMessages,
} from "@/lib/db";
import { requireDashboardGuildAccess } from "@/lib/session";
import { getDashboardBotToken } from "@/lib/runtime-secrets";

type AutoRoleCondition = "more_than" | "less_than" | "equal_to";
type AutoRoleConfigPayload = {
  enabled: boolean;
  requiredRoleMode: "all_roles" | "selected_roles";
  requiredRoleIds: string[];
  rules: {
    id: string;
    condition: AutoRoleCondition;
    hours: number;
    roleId: string;
    requiredRoleMode: "any_role" | "specific_role";
    requiredRoleId: string | null;
  }[];
  requireAdminApproval: boolean;
  approvalChannelId: string | null;
};

type SpamCatcherConfigPayload = {
  enabled: boolean;
  channelIds: string[];
  timeoutMinutes: number;
  autoBanEnabled: boolean;
  banMode: "immediate" | "after_timeout" | "delayed";
  banDelayMinutes: number;
  reviewChannelId: string | null;
  webhookEnabled: boolean;
  webhookUrl: string | null;
  webhookUrls: { channelId: string; webhookUrl: string }[];
};

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

function withWebhookComponentsEnabled(webhookUrl: string, waitForMessage = false) {
  const url = new URL(webhookUrl);
  url.searchParams.set("with_components", "true");
  if (waitForMessage) {
    url.searchParams.set("wait", "true");
  }
  return url.toString();
}

async function getDiscordWebhookDestination(webhookUrl: string) {
  const response = await fetch(webhookUrl, { cache: "no-store" }).catch((error) => {
    throw new Error(`Failed to check Discord webhook: ${error instanceof Error ? error.message : String(error)}`);
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Discord webhook check failed (${response.status}). Make sure the webhook still exists and the URL includes its token.${detail ? ` ${detail}` : ""}`
    );
  }

  const webhook = (await response.json().catch(() => null)) as {
    channel_id?: string;
    guild_id?: string;
    name?: string | null;
  } | null;
  if (!webhook?.channel_id) {
    throw new Error("Discord webhook check did not return a destination channel.");
  }

  return {
    channelId: webhook.channel_id,
    guildId: webhook.guild_id ?? null,
    name: webhook.name ?? null,
  };
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

function normalizeSpamCatcherConfig(value: unknown): SpamCatcherConfigPayload {
  const source = value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
  const timeoutMinutes = Number(source.timeoutMinutes);
  const banDelayMinutes = Number(source.banDelayMinutes);
  const webhookUrls = Array.isArray(source.webhookUrls)
    ? source.webhookUrls
        .filter((item): item is Record<string, unknown> => item !== null && typeof item === "object")
        .map((item) => ({
          channelId: typeof item.channelId === "string" ? item.channelId.trim() : "",
          webhookUrl: typeof item.webhookUrl === "string" ? item.webhookUrl.trim() : "",
        }))
        .filter((item) => item.channelId.length > 0 && item.webhookUrl.length > 0)
    : [];
  if (webhookUrls.length === 0 && typeof source.webhookUrl === "string" && source.webhookUrl.trim().length > 0) {
    const firstChannelId = Array.isArray(source.channelIds) && typeof source.channelIds[0] === "string" ? source.channelIds[0].trim() : "";
    if (firstChannelId) webhookUrls.push({ channelId: firstChannelId, webhookUrl: source.webhookUrl.trim() });
  }

  return {
    enabled: source.enabled === true,
    channelIds: Array.isArray(source.channelIds)
      ? Array.from(
          new Set(
            source.channelIds
              .filter((id): id is string => typeof id === "string")
              .map((id) => id.trim())
              .filter((id) => id.length > 0)
          )
        )
      : [],
    timeoutMinutes: Number.isFinite(timeoutMinutes)
      ? Math.max(1, Math.min(40_320, Math.floor(timeoutMinutes)))
      : 60,
    autoBanEnabled: source.autoBanEnabled === true,
    banMode:
      source.banMode === "immediate" || source.banMode === "after_timeout"
        ? source.banMode
        : "delayed",
    banDelayMinutes: Number.isFinite(banDelayMinutes)
      ? Math.floor(banDelayMinutes) <= 60
        ? Math.max(1, Math.floor(banDelayMinutes))
        : Math.max(2, Math.min(24, Math.floor(banDelayMinutes / 60))) * 60
      : 10,
    reviewChannelId:
      typeof source.reviewChannelId === "string" && source.reviewChannelId.trim().length > 0
        ? source.reviewChannelId.trim()
        : null,
    webhookEnabled: source.webhookEnabled === true,
    webhookUrl:
      typeof source.webhookUrl === "string" && source.webhookUrl.trim().length > 0
        ? source.webhookUrl.trim()
        : null,
    webhookUrls,
  };
}

function normalizeAutoRoleConfig(value: unknown): AutoRoleConfigPayload {
  const source = value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};

  const rules = Array.isArray(source.rules)
    ? source.rules
        .filter((rule) => rule && typeof rule === "object")
        .map((rule, index) => {
          const item = rule as Record<string, unknown>;
          const rawHours = Number(item.hours);
          const condition: AutoRoleCondition =
            item.condition === "more_than" ||
            item.condition === "less_than" ||
            item.condition === "equal_to"
              ? item.condition
              : "more_than";
          const requiredRoleMode: "any_role" | "specific_role" =
            item.requiredRoleMode === "specific_role"
              ? "specific_role"
              : "any_role";

          return {
            id:
              typeof item.id === "string" && item.id.trim().length > 0
                ? item.id.trim()
                : `rule_${index + 1}`,
            condition,
            hours: Number.isFinite(rawHours)
              ? Math.max(0, Math.floor(rawHours))
              : 0,
            roleId: typeof item.roleId === "string" ? item.roleId.trim() : "",
            requiredRoleMode,
            requiredRoleId:
              typeof item.requiredRoleId === "string" && item.requiredRoleId.trim().length > 0
                ? item.requiredRoleId.trim()
                : null,
          };
        })
    : [];

  return {
    enabled: source.enabled === true,
    requiredRoleMode:
      source.requiredRoleMode === "selected_roles"
        ? "selected_roles"
        : "all_roles",
    requiredRoleIds: Array.isArray(source.requiredRoleIds)
      ? Array.from(
          new Set(
            source.requiredRoleIds
              .filter((id): id is string => typeof id === "string")
              .map((id) => id.trim())
              .filter((id) => id.length > 0)
          )
        )
      : [],
    rules: rules.filter((rule) => rule.roleId.length > 0),
    requireAdminApproval: source.requireAdminApproval === true,
    approvalChannelId:
      typeof source.approvalChannelId === "string" &&
      source.approvalChannelId.trim().length > 0
        ? source.approvalChannelId.trim()
        : null,
  };
}

function ruleSignature(rule: AutoRoleConfigPayload["rules"][number]) {
  return `${rule.condition}|${rule.hours}|${rule.roleId}|${rule.requiredRoleMode}|${rule.requiredRoleId || ""}`;
}

function formatRuleSignature(signature: string) {
  const [condition, hours, roleId, requiredRoleMode, requiredRoleId] = signature.split("|");
  const conditionLabel =
    condition === "more_than"
      ? "More than"
      : condition === "less_than"
        ? "Less than"
        : "Equal to";
  const requiredText =
    requiredRoleMode === "specific_role" && requiredRoleId
      ? ` | required: <@&${requiredRoleId}> (\`${requiredRoleId}\`)`
      : " | required: Any role";
  return `${conditionLabel} ${hours}h -> <@&${roleId}> (\`${roleId}\`)${requiredText}`;
}

function buildAutoRoleChangeLines(
  previousConfig: AutoRoleConfigPayload,
  nextConfig: AutoRoleConfigPayload
) {
  const lines: string[] = [];

  if (previousConfig.enabled !== nextConfig.enabled) {
    lines.push(`- Enable Auto Role: **${nextConfig.enabled ? "ON" : "OFF"}**`);
  }

  if (previousConfig.requiredRoleMode !== nextConfig.requiredRoleMode) {
    lines.push(
      `- Required Role Mode: **${nextConfig.requiredRoleMode === "all_roles" ? "All Roles" : "Selected Roles"}**`
    );
  }

  const prevRequired = new Set(previousConfig.requiredRoleIds);
  const nextRequired = new Set(nextConfig.requiredRoleIds);
  const addedRequired = [...nextRequired].filter((id) => !prevRequired.has(id));
  const removedRequired = [...prevRequired].filter((id) => !nextRequired.has(id));
  if (addedRequired.length) {
    lines.push(`- Required roles added: ${addedRequired.map((id) => `<@&${id}> (\`${id}\`)`).join(", ")}`);
  }
  if (removedRequired.length) {
    lines.push(`- Required roles removed: ${removedRequired.map((id) => `<@&${id}> (\`${id}\`)`).join(", ")}`);
  }

  if (previousConfig.requireAdminApproval !== nextConfig.requireAdminApproval) {
    lines.push(
      `- Require Admin Permission: **${nextConfig.requireAdminApproval ? "ON" : "OFF"}**`
    );
  }

  if (previousConfig.approvalChannelId !== nextConfig.approvalChannelId) {
    lines.push(
      `- Approval Channel: ${nextConfig.approvalChannelId ? `<#${nextConfig.approvalChannelId}>` : "(none)"}`
    );
  }

  const prevRules = new Map<string, number>();
  for (const rule of previousConfig.rules) {
    const key = ruleSignature(rule);
    prevRules.set(key, (prevRules.get(key) || 0) + 1);
  }
  const nextRules = new Map<string, number>();
  for (const rule of nextConfig.rules) {
    const key = ruleSignature(rule);
    nextRules.set(key, (nextRules.get(key) || 0) + 1);
  }

  const ruleAdded: string[] = [];
  const ruleRemoved: string[] = [];
  const allKeys = new Set([...prevRules.keys(), ...nextRules.keys()]);
  for (const key of allKeys) {
    const prevCount = prevRules.get(key) || 0;
    const nextCount = nextRules.get(key) || 0;
    if (nextCount > prevCount) {
      for (let i = 0; i < nextCount - prevCount; i += 1) {
        ruleAdded.push(key);
      }
    } else if (prevCount > nextCount) {
      for (let i = 0; i < prevCount - nextCount; i += 1) {
        ruleRemoved.push(key);
      }
    }
  }

  if (ruleAdded.length) {
    lines.push(`- Time rules added: ${ruleAdded.map(formatRuleSignature).join("; ")}`);
  }
  if (ruleRemoved.length) {
    lines.push(`- Time rules removed: ${ruleRemoved.map(formatRuleSignature).join("; ")}`);
  }

  return lines;
}

async function sendAutoRoleConfigLog({
  guildId,
  actorId,
  logChannelId,
  lines,
}: {
  guildId: string;
  actorId: string | null;
  logChannelId: string;
  lines: string[];
}) {
  if (!lines.length) return;

  const botToken = await getDashboardBotToken();
  if (!botToken) return;

  const now = Math.floor(Date.now() / 1000);
  const detailText = [
    "### Auto Role Config Updated",
    "-# Perubahan konfigurasi auto role terdeteksi dari dashboard.",
    "",
    `- Guild: \`${guildId}\``,
    actorId ? `- Updated by: <@${actorId}>` : "- Updated by: dashboard",
    ...lines,
  ].join("\n");

  await fetch(`https://discord.com/api/v10/channels/${logChannelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      flags: 32768,
      components: [
        {
          type: 17,
          accent_color: 0x3b82f6,
          components: [
            {
              type: 10,
              content: detailText,
            },
            {
              type: 14,
              divider: true,
            },
            {
              type: 10,
              content: `-# Updated at: <t:${now}:F>`,
            },
          ],
        },
      ],
      allowed_mentions: {
        parse: [],
        users: actorId ? [actorId] : [],
      },
    }),
  }).catch(() => null);
}

function formatNoticeMinutes(minutes: number) {
  const safeMinutes = Math.max(1, Math.floor(Number(minutes) || 1));
  if (safeMinutes % 1440 === 0) {
    const days = safeMinutes / 1440;
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  if (safeMinutes % 60 === 0) {
    const hours = safeMinutes / 60;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return `${safeMinutes} minute${safeMinutes === 1 ? "" : "s"}`;
}

function buildSpamCatcherNoticePayload(
  caughtCount: number,
  config: SpamCatcherConfigPayload
) {
  const safeCount = Math.max(0, Math.floor(Number(caughtCount) || 0));
  const timeoutText = formatNoticeMinutes(config.timeoutMinutes);
  const banDelayText = formatNoticeMinutes(config.banDelayMinutes);
  const actionId = config.autoBanEnabled
    ? config.banMode === "immediate"
      ? "kamu akan langsung terkena `ban`."
      : config.banMode === "after_timeout"
        ? `kamu akan terkena \`timeout\` selama ${timeoutText}, lalu terkena \`ban\` saat timeout berakhir.`
        : `kamu akan terkena \`timeout\` selama ${timeoutText}, lalu terkena \`ban\` setelah periode appeal selama ${banDelayText}.`
    : `kamu akan terkena \`timeout\` selama ${timeoutText}.`;
  const appealId = config.autoBanEnabled && config.banMode === "immediate"
    ? "Jika ini adalah kesalahan, silakan hubungi admin server."
    : "Jika kamu terkena timeout, silakan kirim private message ke salah satu admin yang sedang online atau gunakan tombol appeal jika tersedia.";
  const actionEn = config.autoBanEnabled
    ? config.banMode === "immediate"
      ? "you will be `banned` immediately."
      : config.banMode === "after_timeout"
        ? `you will receive a \`timeout\` for ${timeoutText}, then be \`banned\` when the timeout ends.`
        : `you will receive a \`timeout\` for ${timeoutText}, then be \`banned\` after a ${banDelayText} appeal window.`
    : `you will receive a \`timeout\` for ${timeoutText}.`;
  const appealEn = config.autoBanEnabled && config.banMode === "immediate"
    ? "If this was a mistake, please contact a server admin."
    : "If you are timed out, please send a private message to one of the online admins or use the appeal button if available.";
  const contentId = [
    "# 🚫 Dilarang Mengirim Pesan di Channel Ini",
    `⚠️ Channel ini dibuat untuk menangkap spammer. Jika kamu mengirim pesan di channel ini, ${actionId} ${appealId}`,
    "",
    "## 😈 Jangan Berani-Berani Mencoba",
    "Kalau cuma mau tes, sistem tetap akan menangkap kamu.",
    "",
    `-# Jumlah user yang sudah tertangkap di channel ini: \`${safeCount}\``,
  ].join("\n");
  const contentEn = [
    "# 🚫 Do Not Send Messages in This Channel",
    `⚠️ This channel is made to catch spammers. If you send a message in this channel, ${actionEn} ${appealEn}`,
    "",
    "## 😈 Don't Even Think About Trying",
    "Even if you are just testing, the system will still catch you.",
    "",
    `-# Caught users in this channel: \`${safeCount}\``,
  ].join("\n");

  return {
    flags: 32768,
    components: [
      {
        type: 17,
        components: [
          { type: 10, content: contentId },
          { type: 14, divider: true, spacing: 1 },
          { type: 10, content: contentEn },
        ],
      },
    ],
    allowed_mentions: { parse: [] },
  };
}

async function sendSpamCatcherTrapChannelNotices({
  guildId,
  channelIds,
  caughtCounts,
  config,
  webhookUrls,
}: {
  guildId: string;
  channelIds: string[];
  caughtCounts: Record<string, number>;
  config: SpamCatcherConfigPayload;
  webhookUrls?: { channelId: string; webhookUrl: string }[];
}) {
  if (!channelIds.length) return [];
  const notices: {
    channelId: string;
    messageId: string;
    deliveryMethod: "bot" | "webhook";
    webhookUrl?: string | null;
  }[] = [];

  const webhookByChannel = new Map((webhookUrls ?? []).map((item) => [item.channelId, item.webhookUrl]));
  if (webhookByChannel.size > 0) {
    for (const channelId of channelIds) {
      const webhookUrl = webhookByChannel.get(channelId);
      if (!webhookUrl) continue;
      const response = await fetch(withWebhookComponentsEnabled(webhookUrl, true), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildSpamCatcherNoticePayload(caughtCounts[channelId] ?? 0, config)),
      }).catch((error) => {
        console.error("Failed to send Spam Catcher webhook notice:", {
          channelId,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      });
      if (response && !response.ok) {
        console.error("Discord webhook rejected Spam Catcher notice:", {
          channelId,
          status: response.status,
          detail: await response.text().catch(() => ""),
        });
      }
      if (response?.ok) {
        const message = (await response.json().catch(() => null)) as { id?: string; channel_id?: string } | null;
        if (message?.id) {
          notices.push({
            channelId,
            messageId: message.id,
            deliveryMethod: "webhook",
            webhookUrl,
          });
        }
      }
    }
    await saveSpamCatcherNoticeMessages(guildId, notices).catch((error) => {
      console.error("Failed to save Spam Catcher webhook notice message:", error);
    });
    return notices;
  }

  const botToken = await getDashboardBotToken();
  if (!botToken) return notices;

  for (const channelId of channelIds) {
    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildSpamCatcherNoticePayload(caughtCounts[channelId] ?? 0, config)),
    }).catch((error) => {
      console.error("Failed to send Spam Catcher trap-channel notice:", {
        channelId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    });
    if (response?.ok) {
      const message = (await response.json().catch(() => null)) as { id?: string } | null;
      if (message?.id) {
        notices.push({ channelId, messageId: message.id, deliveryMethod: "bot" });
      }
    }
  }
  await saveSpamCatcherNoticeMessages(guildId, notices).catch((error) => {
    console.error("Failed to save Spam Catcher notice messages:", error);
  });
  return notices;
}

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireDashboardGuildAccess(id);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const config = await getGuildConfig(id);
    return NextResponse.json({
      logChannelId: config.logChannelId,
      lfgChannelId: config.lfgChannelId,
      enabledVoiceChannelIds: config.enabledVoiceChannelIds,
      joinToCreateLobbies: config.joinToCreateLobbies,
      autoRoleConfig: config.autoRoleConfig,
      spamCatcherConfig: config.spamCatcherConfig,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Failed to load config" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireDashboardGuildAccess(id);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = (await request.json()) as {
    logChannelId?: string;
    lfgChannelId?: string | null;
    enabledVoiceChannelIds?: string[];
    joinToCreateLobbies?: {
      channelId?: string;
      roleId?: string;
      lfgEnabled?: boolean;
      lfgReminderEnabled?: boolean;
      lfgReminderSeconds?: number;
    }[];
    autoRoleConfig?: unknown;
    spamCatcherConfig?: unknown;
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
            lfgEnabled:
              typeof item.lfgEnabled === "boolean" ? item.lfgEnabled : true,
            lfgReminderEnabled:
              typeof item.lfgReminderEnabled === "boolean" ? item.lfgReminderEnabled : false,
            lfgReminderSeconds:
              Number.isFinite(Number(item.lfgReminderSeconds))
                ? Math.max(5, Math.min(3600, Math.floor(Number(item.lfgReminderSeconds))))
                : 30,
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

  const autoRoleConfig = normalizeAutoRoleConfig(body.autoRoleConfig);
  const spamCatcherConfig = normalizeSpamCatcherConfig(body.spamCatcherConfig);
  if (
    autoRoleConfig.requireAdminApproval &&
    !autoRoleConfig.approvalChannelId
  ) {
    return NextResponse.json(
      { error: "approvalChannelId is required when admin approval is enabled." },
      { status: 400 }
    );
  }

  if (
    autoRoleConfig.requiredRoleMode === "selected_roles" &&
    autoRoleConfig.requiredRoleIds.length === 0
  ) {
    return NextResponse.json(
      { error: "Select at least one required role or switch to All Roles." },
      { status: 400 }
    );
  }

  if (
    autoRoleConfig.rules.some(
      (rule) => rule.requiredRoleMode === "specific_role" && !rule.requiredRoleId
    )
  ) {
    return NextResponse.json(
      { error: "Each rule with Required role mode must select one role." },
      { status: 400 }
    );
  }

  if (spamCatcherConfig.enabled && spamCatcherConfig.channelIds.length === 0) {
    return NextResponse.json(
      { error: "Select at least one spam catcher channel or disable Spam Catcher." },
      { status: 400 }
    );
  }

  if (
    spamCatcherConfig.enabled &&
    !spamCatcherConfig.reviewChannelId
  ) {
    return NextResponse.json(
      { error: "Review channel is required for Spam Catcher review messages." },
      { status: 400 }
    );
  }

  let webhookDestination: {
    channelId: string;
    channelName: string | null;
    guildId: string | null;
    name: string | null;
  }[] = [];

  if (spamCatcherConfig.enabled && spamCatcherConfig.webhookEnabled) {
    const trapChannelIds = new Set(spamCatcherConfig.channelIds);
    const webhookChannelIds = new Set(spamCatcherConfig.webhookUrls.map((item) => item.channelId));
    const missingChannelId = spamCatcherConfig.channelIds.find((channelId) => !webhookChannelIds.has(channelId));
    if (missingChannelId) {
      return NextResponse.json(
        { error: `Add a webhook URL for trap channel <#${missingChannelId}> or disable webhook delivery.` },
        { status: 400 }
      );
    }
    const extraMapping = spamCatcherConfig.webhookUrls.find((item) => !trapChannelIds.has(item.channelId));
    if (extraMapping) {
      return NextResponse.json(
        { error: "Remove webhook rows that are not assigned to a selected trap channel." },
        { status: 400 }
      );
    }
    const invalidWebhook = spamCatcherConfig.webhookUrls.find((item) => !isDiscordWebhookUrl(item.webhookUrl));
    if (invalidWebhook) {
      return NextResponse.json(
        { error: `Enter a valid Discord webhook URL for trap channel <#${invalidWebhook.channelId}>.` },
        { status: 400 }
      );
    }

    try {
      for (const mapping of spamCatcherConfig.webhookUrls) {
        const destination = await getDiscordWebhookDestination(mapping.webhookUrl);
        if (destination.guildId && destination.guildId !== id) {
          return NextResponse.json(
            { error: `The webhook for trap channel <#${mapping.channelId}> belongs to a different Discord server.` },
            { status: 400 }
          );
        }
        if (destination.channelId !== mapping.channelId) {
          return NextResponse.json(
            { error: `The webhook for <#${mapping.channelId}> sends to <#${destination.channelId}>. Use a webhook from the same trap channel.` },
            { status: 400 }
          );
        }
        webhookDestination.push({
          ...destination,
          channelName: await getDiscordChannelName(destination.channelId),
        });
      }
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Failed to check Discord webhook." },
        { status: 400 }
      );
    }
  }

  try {
    const previousConfig = await getGuildConfig(id);

    await saveGuildConfig(id, {
      logChannelId: body.logChannelId,
      lfgChannelId,
      enabledVoiceChannelIds,
      joinToCreateLobbies,
      autoRoleConfig,
      spamCatcherConfig,
    });

    const changeLines = buildAutoRoleChangeLines(
      normalizeAutoRoleConfig(previousConfig.autoRoleConfig),
      autoRoleConfig
    );
    await sendAutoRoleConfigLog({
      guildId: id,
      actorId: access.session?.user?.id ?? null,
      logChannelId: body.logChannelId,
      lines: changeLines,
    });

    if (spamCatcherConfig.enabled && spamCatcherConfig.channelIds.length > 0) {
      const caughtCounts = await getSpamCatcherCaughtUserCounts(
        id,
        spamCatcherConfig.channelIds
      ).catch((error) => {
        console.error("Failed to count Spam Catcher caught users:", error);
        return {} as Record<string, number>;
      });
      await sendSpamCatcherTrapChannelNotices({
        guildId: id,
        channelIds: spamCatcherConfig.channelIds,
        caughtCounts,
        config: spamCatcherConfig,
        webhookUrls: spamCatcherConfig.webhookEnabled ? spamCatcherConfig.webhookUrls : [],
      });
    }
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, spamCatcherWebhooks: webhookDestination });
}
