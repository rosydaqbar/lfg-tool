const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');
const {
  ContainerBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
} = require('@discordjs/builders');
const { getGuildLocale, t } = require('../i18n');

const APPROVE_PREFIX = 'autorole_approve';
const DENY_PREFIX = 'autorole_deny';
const EVALUATE_INTERVAL_MS = 3 * 60 * 1000;

function formatDuration(totalMs, locale = 'en') {
  const safeMs = Math.max(0, Number(totalMs) || 0);
  const totalMinutes = Math.floor(safeMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return t(locale, 'common.durationHoursMinutes', { hours, minutes });
}

function createAutoRoleManager({ client, configStore }) {
  let interval = null;
  let running = false;

  function buildRuleKey(rule) {
    return `${rule.condition}:${rule.hours}:${rule.roleId}:${rule.requiredRoleMode || 'any_role'}:${rule.requiredRoleId || ''}`;
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

  function hasRuleRequiredRole(member, rule) {
    if (!member || !rule) return false;
    if ((rule.requiredRoleMode || 'any_role') !== 'specific_role') return true;
    if (!rule.requiredRoleId) return false;
    return member.roles.cache.has(rule.requiredRoleId);
  }

  function buildApprovalPayload({ requestId, memberId, roleId, rule, totalMs, locale = 'en' }) {
    const conditionLabel =
      rule.condition === 'more_than'
        ? t(locale, 'autoRole.moreThan')
        : rule.condition === 'less_than'
          ? t(locale, 'autoRole.lessThan')
          : t(locale, 'autoRole.equalTo');

    return {
      components: [
        new ContainerBuilder()
          .setAccentColor(0xf59e0b)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              [
                t(locale, 'autoRole.title'),
                t(locale, 'autoRole.help'),
                '',
                t(locale, 'autoRole.user', { memberId }),
                t(locale, 'autoRole.roleToGrant', { roleId }),
                t(locale, 'autoRole.currentVoice', { duration: formatDuration(totalMs, locale) }),
                t(locale, 'autoRole.matchingRule', { condition: conditionLabel, hours: rule.hours }),
              ].join('\n')
            )
          )
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
          .addActionRowComponents(
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`${APPROVE_PREFIX}:${requestId}`)
                .setLabel(t(locale, 'autoRole.approve'))
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId(`${DENY_PREFIX}:${requestId}`)
                .setLabel(t(locale, 'autoRole.deny'))
                .setStyle(ButtonStyle.Danger)
            )
          )
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              t(locale, 'autoRole.requestMeta', {
                requestId,
                timestamp: `<t:${Math.floor(Date.now() / 1000)}:R>`,
              })
            )
          ),
      ],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [], users: [memberId], roles: [roleId] },
    };
  }

  function buildResolvedMessageContent({
    status,
    request,
    adminId,
    locale = 'en',
  }) {
    const statusLabel = t(locale, status === 'approved' ? 'autoRole.approved' : 'autoRole.denied');
    const emoji = status === 'approved' ? '✅' : '❌';
    const accentColor = status === 'approved' ? 0x22c55e : 0xef4444;
    return [
      new ContainerBuilder()
        .setAccentColor(accentColor)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            [
              t(locale, 'autoRole.title'),
              t(locale, 'autoRole.user', { memberId: request.userId }),
              t(locale, 'autoRole.roleResult', {
                verb: t(locale, status === 'approved' ? 'autoRole.roleGrantedVerb' : 'autoRole.roleRequestedVerb'),
                roleId: request.roleId,
              }),
              t(locale, 'autoRole.currentVoice', { duration: formatDuration(request.totalMs, locale) }),
              t(locale, 'autoRole.resolvedStatus', {
                emoji,
                status: statusLabel,
                adminId,
                timestamp: `<t:${Math.floor(Date.now() / 1000)}:F>`,
              }),
            ].join('\n')
          )
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            t(locale, 'autoRole.resolvedMeta', { requestId: request.id })
          )
        ),
    ];
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
    const locale = await getGuildLocale(configStore, guild.id);

    const sent = await approvalChannel
      .send(buildApprovalPayload({
        requestId: request.id,
        memberId: member.id,
        roleId: rule.roleId,
        rule,
        totalMs,
        locale,
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
    const locale = await getGuildLocale(configStore, guild.id);

    for (const entry of totals) {
      const member = await guild.members.fetch(entry.userId).catch(() => null);
      if (!member || member.user?.bot) continue;
      if (!hasRequiredRole(member, autoRoleConfig)) continue;

      for (const rule of autoRoleConfig.rules) {
        if (!rule?.roleId) continue;
        if (!isRuleMatched(entry.totalMs, rule)) continue;
        if (!hasRuleRequiredRole(member, rule)) continue;
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

        await member.roles.add(rule.roleId, t(locale, 'autoRole.assignReason')).catch((error) => {
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
    const locale = await getGuildLocale(configStore, interaction.guildId);

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        content: t(locale, 'autoRole.adminOnly'),
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
      return true;
    }

    const [, requestIdRaw] = interaction.customId.split(':');
    const requestId = Number(requestIdRaw);
    if (!Number.isFinite(requestId) || requestId <= 0) {
      await interaction.reply({
        content: t(locale, 'autoRole.invalidRequestId'),
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
      return true;
    }

    const request = await configStore.getVoiceAutoRoleRequestById(requestId).catch(() => null);
    if (!request) {
      await interaction.reply({
        content: t(locale, 'autoRole.requestNotFound'),
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
      return true;
    }

    if (request.status !== 'pending') {
      const requestStatus = t(locale, `autoRole.${request.status}`);
      const deleted = await interaction.message?.delete().then(() => true).catch(() => false);
      if (deleted) {
        await interaction.reply({
          content: t(locale, 'autoRole.alreadyProcessedDeleted', { status: requestStatus }),
          flags: MessageFlags.Ephemeral,
        }).catch(() => null);
        return true;
      }

      await interaction.update({
        content: '',
        components: buildResolvedMessageContent({
          status: request.status,
          request,
          adminId: request.decidedBy || interaction.user.id,
          locale,
        }),
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
      }).catch(async () => {
        await interaction.reply({
          content: t(locale, 'autoRole.alreadyProcessed', { status: requestStatus }),
          flags: MessageFlags.Ephemeral,
        }).catch(() => null);
      });
      return true;
    }

    let status = isDeny ? 'denied' : null;
    if (isApprove) {
      const guild = interaction.guild;
      const member = guild
        ? await guild.members.fetch(request.userId).catch(() => null)
        : null;
      if (!member) {
        await interaction.reply({
          content: t(locale, 'autoRole.userMissing'),
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }

      let addError = null;
      await member.roles
        .add(request.roleId, t(locale, 'autoRole.approvedReason', { adminId: interaction.user.id }))
        .catch((error) => {
          addError = error;
        });

      if (addError) {
        console.error('Failed to approve auto role request:', addError);
        await interaction.reply({
          content:
            t(locale, 'autoRole.grantFailed'),
          flags: MessageFlags.Ephemeral,
        }).catch(() => null);
        return true;
      }

      status = 'approved';
    }

    if (!status) return true;

    await configStore
      .updateVoiceAutoRoleRequestStatus(request.id, status, interaction.user.id)
      .catch((error) => {
        console.error('Failed to update auto-role request status:', error);
      });

    const updated = await interaction.update({
      content: '',
      components: buildResolvedMessageContent({
        status,
        request,
        adminId: interaction.user.id,
        locale,
      }),
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    }).then(() => true).catch(() => false);

    if (!updated) {
      await interaction.reply({
        content: t(locale, 'autoRole.updateFailed', {
          status: t(locale, status === 'approved' ? 'autoRole.approved' : 'autoRole.denied'),
        }),
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
