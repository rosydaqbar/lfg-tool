const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');

const APPROVE_PREFIX = 'autorole_approve';
const DENY_PREFIX = 'autorole_deny';
const EVALUATE_INTERVAL_MS = 3 * 60 * 1000;

function formatDuration(totalMs) {
  const safeMs = Math.max(0, Number(totalMs) || 0);
  const totalMinutes = Math.floor(safeMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function createAutoRoleManager({ client, configStore }) {
  let interval = null;
  let running = false;

  function buildRuleKey(rule) {
    return `${rule.condition}:${rule.hours}:${rule.roleId}`;
  }

  function isRuleMatched(totalMs, rule) {
    const totalHours = totalMs / (60 * 60 * 1000);
    if (rule.condition === 'more_than') return totalHours > rule.hours;
    if (rule.condition === 'less_than') return totalHours < rule.hours;
    return totalHours === rule.hours;
  }

  function hasRequiredRole(member, autoRoleConfig) {
    if (!member || autoRoleConfig.requiredRoleMode !== 'selected_roles') {
      return true;
    }
    if (!autoRoleConfig.requiredRoleIds.length) {
      return false;
    }
    return autoRoleConfig.requiredRoleIds.some((roleId) => member.roles.cache.has(roleId));
  }

  function buildApprovalPayload({ requestId, memberId, roleId, rule, totalMs }) {
    const conditionLabel =
      rule.condition === 'more_than'
        ? 'more than'
        : rule.condition === 'less_than'
          ? 'less than'
          : 'equal to';

    const lines = [
      '### Auto Role Approval Request',
      `- User: <@${memberId}>`,
      `- Role to give: <@&${roleId}> (\`${roleId}\`)`,
      `- Current total voice: \`${formatDuration(totalMs)}\``,
      `- Matched rule: \`${conditionLabel} ${rule.hours}h\``,
      '- Action required: Administrator approval',
    ];

    return {
      content: lines.join('\n'),
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`${APPROVE_PREFIX}:${requestId}`)
            .setLabel('Approve')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`${DENY_PREFIX}:${requestId}`)
            .setLabel('Deny')
            .setStyle(ButtonStyle.Danger)
        ),
      ],
      allowedMentions: { parse: [], users: [memberId], roles: [roleId] },
    };
  }

  function buildResolvedMessageContent({
    status,
    request,
    adminId,
  }) {
    const statusLabel = status === 'approved' ? 'Approved' : 'Denied';
    const emoji = status === 'approved' ? '✅' : '❌';
    const lines = [
      '### Auto Role Approval Request',
      `- User: <@${request.userId}>`,
      `- Role to give: <@&${request.roleId}> (\`${request.roleId}\`)`,
      `- Current total voice: \`${formatDuration(request.totalMs)}\``,
      `${emoji} Status: **${statusLabel}** by <@${adminId}> at <t:${Math.floor(Date.now() / 1000)}:F>`,
    ];
    return lines.join('\n');
  }

  async function maybeCreateApprovalRequest({
    guild,
    member,
    autoRoleConfig,
    rule,
    totalMs,
  }) {
    if (!autoRoleConfig.approvalChannelId) return;

    const ruleKey = buildRuleKey(rule);
    const existing = await configStore.getVoiceAutoRoleRequest(
      guild.id,
      member.id,
      rule.roleId,
      ruleKey
    ).catch(() => null);

    if (existing?.status === 'approved' || existing?.status === 'denied') {
      return;
    }

    const request = existing || await configStore
      .createOrGetVoiceAutoRoleRequest({
        guildId: guild.id,
        userId: member.id,
        roleId: rule.roleId,
        ruleKey,
        totalMs,
      })
      .catch(() => null);

    if (!request) return;

    if (request.messageId && request.messageChannelId) {
      const existingChannel = await guild.channels.fetch(request.messageChannelId).catch(() => null);
      if (existingChannel?.isTextBased()) {
        const existingMessage = await existingChannel.messages.fetch(request.messageId).catch(() => null);
        if (existingMessage) return;
      }
    }

    const approvalChannel = await guild.channels
      .fetch(autoRoleConfig.approvalChannelId)
      .catch(() => null);
    if (!approvalChannel || !approvalChannel.isTextBased()) return;

    const sent = await approvalChannel
      .send(buildApprovalPayload({
        requestId: request.id,
        memberId: member.id,
        roleId: rule.roleId,
        rule,
        totalMs,
      }))
      .catch((error) => {
        console.error('Failed to send auto-role approval request:', error);
        return null;
      });

    if (!sent) return;

    await configStore
      .updateVoiceAutoRoleRequestMessage(request.id, approvalChannel.id, sent.id)
      .catch((error) => {
        console.error('Failed to persist auto-role approval message:', error);
      });
  }

  async function processGuild(guild) {
    const autoRoleConfig = await configStore
      .getVoiceAutoRoleConfig(guild.id)
      .catch(() => null);
    if (!autoRoleConfig?.enabled) return;
    if (!Array.isArray(autoRoleConfig.rules) || autoRoleConfig.rules.length === 0) return;

    const totals = await configStore.getGuildVoiceTotals(guild.id).catch(() => []);
    if (!totals.length) return;

    for (const entry of totals) {
      const member = await guild.members.fetch(entry.userId).catch(() => null);
      if (!member || member.user?.bot) continue;
      if (!hasRequiredRole(member, autoRoleConfig)) continue;

      for (const rule of autoRoleConfig.rules) {
        if (!rule?.roleId) continue;
        if (!isRuleMatched(entry.totalMs, rule)) continue;
        if (member.roles.cache.has(rule.roleId)) continue;

        if (autoRoleConfig.requireAdminApproval) {
          await maybeCreateApprovalRequest({
            guild,
            member,
            autoRoleConfig,
            rule,
            totalMs: entry.totalMs,
          });
          continue;
        }

        await member.roles.add(rule.roleId, 'Auto role by voice time').catch((error) => {
          console.error('Failed to assign auto role:', error);
        });
      }
    }
  }

  async function runOnce() {
    if (running) return;
    running = true;
    try {
      for (const guild of client.guilds.cache.values()) {
        await processGuild(guild);
      }
    } finally {
      running = false;
    }
  }

  function startLoop() {
    if (interval) return;
    runOnce().catch((error) => {
      console.error('Failed initial auto-role evaluation:', error);
    });
    interval = setInterval(() => {
      runOnce().catch((error) => {
        console.error('Failed scheduled auto-role evaluation:', error);
      });
    }, EVALUATE_INTERVAL_MS);
  }

  function stopLoop() {
    if (!interval) return;
    clearInterval(interval);
    interval = null;
  }

  async function handleInteraction(interaction) {
    if (!interaction.isButton()) return false;
    const isApprove = interaction.customId.startsWith(`${APPROVE_PREFIX}:`);
    const isDeny = interaction.customId.startsWith(`${DENY_PREFIX}:`);
    if (!isApprove && !isDeny) return false;

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        content: 'Hanya Administrator yang bisa memproses approval auto role.',
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
      return true;
    }

    const [, requestIdRaw] = interaction.customId.split(':');
    const requestId = Number(requestIdRaw);
    if (!Number.isFinite(requestId) || requestId <= 0) {
      await interaction.reply({
        content: 'Request ID tidak valid.',
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
      return true;
    }

    const request = await configStore.getVoiceAutoRoleRequestById(requestId).catch(() => null);
    if (!request) {
      await interaction.reply({
        content: 'Request tidak ditemukan.',
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
      return true;
    }

    if (request.status !== 'pending') {
      await interaction.reply({
        content: `Request ini sudah diproses (${request.status}).`,
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
      return true;
    }

    let status = isApprove ? 'approved' : 'denied';
    if (isApprove) {
      const guild = interaction.guild;
      const member = guild
        ? await guild.members.fetch(request.userId).catch(() => null)
        : null;
      if (!member) {
        status = 'denied';
      } else {
        await member.roles.add(request.roleId, `Auto role approved by ${interaction.user.id}`).catch((error) => {
          console.error('Failed to approve auto role request:', error);
          status = 'denied';
        });
      }
    }

    await configStore
      .updateVoiceAutoRoleRequestStatus(request.id, status, interaction.user.id)
      .catch((error) => {
        console.error('Failed to update auto-role request status:', error);
      });

    const updated = await interaction.update({
      content: buildResolvedMessageContent({
        status,
        request,
        adminId: interaction.user.id,
      }),
      components: [],
      allowedMentions: { parse: [] },
    }).then(() => true).catch(() => false);

    if (!updated) {
      await interaction.reply({
        content: `Request ${status === 'approved' ? 'approved' : 'denied'} tetapi gagal memperbarui pesan approval.`,
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
    }

    return true;
  }

  return {
    startLoop,
    stopLoop,
    handleInteraction,
  };
}

module.exports = { createAutoRoleManager };
