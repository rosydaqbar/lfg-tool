import { NextResponse } from "next/server";
import { getGuildConfig, saveGuildConfig } from "@/lib/db";
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
  }[];
  requireAdminApproval: boolean;
  approvalChannelId: string | null;
};

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
  return `${rule.condition}|${rule.hours}|${rule.roleId}`;
}

function formatRuleSignature(signature: string) {
  const [condition, hours, roleId] = signature.split("|");
  const conditionLabel =
    condition === "more_than"
      ? "More than"
      : condition === "less_than"
        ? "Less than"
        : "Equal to";
  return `${conditionLabel} ${hours}h -> <@&${roleId}> (\`${roleId}\`)`;
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
    }[];
    autoRoleConfig?: unknown;
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

  try {
    const previousConfig = await getGuildConfig(id);

    await saveGuildConfig(id, {
      logChannelId: body.logChannelId,
      lfgChannelId,
      enabledVoiceChannelIds,
      joinToCreateLobbies,
      autoRoleConfig,
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
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
