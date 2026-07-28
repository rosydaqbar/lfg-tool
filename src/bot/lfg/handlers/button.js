const { MessageFlags } = require('discord.js');

const {
  CHANNEL_LOCK_PREFIX,
  CHANNEL_NAME_PREFIX,
  CHANNEL_SIZE_PREFIX,
  CHANNEL_SIZE_RETRY_PREFIX,
  CHANNEL_UNLOCK_PREFIX,
  CLAIM_APPROVE_PREFIX,
  CLAIM_DECLINE_PREFIX,
  CLAIM_PREFIX,
  LEADERBOARD_PREFIX,
  LFG_SEND_PREFIX,
  LFG_REMINDER_SEND_PREFIX,
  LFG_SETTINGS_PREFIX,
  MY_STATS_PREFIX,
  REGION_PREFIX,
  TRANSFER_PREFIX,
} = require('../constants');

async function handleButtonInteraction(interaction, deps) {
  const [prefix, channelId, arg1] = interaction.customId.split(':');
  if (!prefix || !channelId) return false;

  const {
    buildChannelNameModal,
    buildChannelSizeModal,
    buildClaimApprovalRow,
    buildLfgModal,
    buildLfgReminderModal,
    buildRegionSelectRow,
    buildTransferMemberSelectRow,
    buildVoiceSettingsRows,
    formatCooldown,
    getCooldownRemainingMs,
    getTempVoiceContext,
    isAdminOverride,
    isOwner,
    transferChannelOwner,
    userIsInVoiceChannel,
    refreshJoinToCreatePrompt,
  } = deps;

  if (prefix === LFG_REMINDER_SEND_PREFIX) {
    const guildId = channelId;
    const targetChannelId = arg1;
    if (!guildId || !targetChannelId) return false;
    const locale = await deps.getGuildLocale(deps.configStore, guildId);

    const tempInfo = await deps.configStore.getTempChannelInfo(targetChannelId);
    if (!tempInfo?.ownerId) {
      await interaction.reply({
        content: deps.t(locale, 'lfg.squadInactive'),
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    if (!isOwner(tempInfo, interaction.user.id)) {
      await interaction.reply({
        content: deps.t(locale, 'lfg.ownerOnlyPost'),
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    if (tempInfo.lfgEnabled === false) {
      await interaction.reply({
        content: deps.t(locale, 'lfg.postDisabled'),
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const remaining = getCooldownRemainingMs(guildId, interaction.user.id);
    if (remaining > 0) {
      await interaction.reply({
        content: deps.t(locale, 'lfg.cooldown', { duration: formatCooldown(remaining, locale) }),
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    try {
      await interaction.showModal(buildLfgReminderModal(guildId, targetChannelId, locale));
    } catch (error) {
      console.error('Failed to show LFG reminder modal:', error);
      await interaction.reply({
        content: deps.t(locale, 'lfg.modalOpenFailed'),
        flags: MessageFlags.Ephemeral,
      });
    }
    return true;
  }

  const guildId = interaction.guildId;
  let currentLocale = await deps.getGuildLocale(deps.configStore, guildId);
  if (!guildId || !interaction.guild) {
    await interaction.reply({
      content: deps.t(currentLocale, 'common.serverOnlyAction'),
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  function overrideNotice(tempInfo) {
    return isAdminOverride?.(tempInfo, interaction.user.id)
      ? deps.t(currentLocale, 'common.override')
      : '';
  }

  if (prefix === LFG_SEND_PREFIX) {
    const tempInfo = await deps.configStore.getTempChannelInfo(channelId);
    if (!tempInfo?.ownerId) {
      await interaction.reply({
        content: deps.t(currentLocale, 'lfg.squadInactive'),
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    if (!isOwner(tempInfo, interaction.user.id)) {
      await interaction.reply({
        content: deps.t(currentLocale, 'lfg.ownerOnlyPost'),
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    if (tempInfo.lfgEnabled === false) {
      await interaction.reply({
        content: deps.t(currentLocale, 'lfg.postDisabled'),
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const remaining = getCooldownRemainingMs(guildId, interaction.user.id);
    if (remaining > 0) {
      await interaction.reply({
        content: deps.t(currentLocale, 'lfg.cooldown', { duration: formatCooldown(remaining, currentLocale) }),
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    try {
      await interaction.showModal(buildLfgModal(channelId, currentLocale));
    } catch (error) {
      console.error('Failed to show LFG modal:', error);
      await interaction.reply({
        content: deps.t(currentLocale, 'lfg.modalOpenFailed'),
        flags: MessageFlags.Ephemeral,
      });
    }
    return true;
  }

  if (prefix === LFG_SETTINGS_PREFIX) {
    const context = await getTempVoiceContext(interaction.guild, channelId);
    currentLocale = context.locale || currentLocale;
    if (context.error) {
      await interaction.reply({
        content: context.error,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    await interaction.reply({
      content: deps.t(currentLocale, 'lfg.settingsIntro', { channelId }),
      components: buildVoiceSettingsRows(channelId, currentLocale),
      allowedMentions: { parse: [] },
    });
    return true;
  }

  if (prefix === CLAIM_APPROVE_PREFIX || prefix === CLAIM_DECLINE_PREFIX) {
    const claimerId = arg1;
    const context = await getTempVoiceContext(interaction.guild, channelId);
    currentLocale = context.locale || currentLocale;
    if (context.error || !claimerId) {
      await interaction.reply({
        content: context.error || deps.t(currentLocale, 'lfg.invalidClaim'),
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (!isOwner(context.tempInfo, interaction.user.id)) {
      await interaction.reply({
        content: deps.t(currentLocale, 'lfg.currentOwnerOnlyClaim'),
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (prefix === CLAIM_DECLINE_PREFIX) {
      const notice = overrideNotice(context.tempInfo);
      await interaction.update({
        content: deps.t(currentLocale, 'lfg.claimDeclined', {
          ownerId: context.tempInfo.ownerId,
          claimerId,
          notice,
        }),
        components: [],
        allowedMentions: {
          users: [context.tempInfo.ownerId, claimerId],
        },
      });
      return true;
    }

    if (!(await userIsInVoiceChannel(context.channel, claimerId))) {
      const notice = overrideNotice(context.tempInfo);
      await interaction.update({
        content: deps.t(currentLocale, 'lfg.claimTransferMissing', {
          ownerId: context.tempInfo.ownerId,
          claimerId,
          notice,
        }),
        components: [],
        allowedMentions: {
          users: [context.tempInfo.ownerId, claimerId],
        },
      });
      return true;
    }

    await transferChannelOwner(channelId, claimerId);
    const notice = overrideNotice(context.tempInfo);
    await interaction.update({
      content: deps.t(currentLocale, 'lfg.ownershipTransferred', { userId: claimerId, notice }),
      components: [],
      allowedMentions: { users: [claimerId] },
    });
    await refreshJoinToCreatePrompt(interaction.guild, channelId);
    return true;
  }

  if (prefix === CLAIM_PREFIX) {
    const context = await getTempVoiceContext(interaction.guild, channelId);
    currentLocale = context.locale || currentLocale;
    if (context.error) {
      await interaction.reply({
        content: context.error,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (isOwner(context.tempInfo, interaction.user.id)) {
      await interaction.reply({
        content: deps.t(currentLocale, 'lfg.alreadyOwner'),
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (!(await userIsInVoiceChannel(context.channel, interaction.user.id))) {
      await interaction.reply({
        content: deps.t(currentLocale, 'lfg.claimMustJoin'),
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const ownerPresent = await userIsInVoiceChannel(
      context.channel,
      context.tempInfo.ownerId
    );

    if (!ownerPresent) {
      await transferChannelOwner(channelId, interaction.user.id);
      await interaction.reply({
        content: deps.t(currentLocale, 'lfg.ownerAbsentTransfer', { userId: interaction.user.id }),
        allowedMentions: { users: [interaction.user.id] },
      });
      await refreshJoinToCreatePrompt(interaction.guild, channelId);
      return true;
    }

    const prompt = deps.t(currentLocale, 'lfg.claimRequest', {
      ownerId: context.tempInfo.ownerId,
      claimerId: interaction.user.id,
    });

    await interaction.reply({
      content: deps.t(currentLocale, 'lfg.claimSent'),
      flags: MessageFlags.Ephemeral,
    });

    await interaction.channel.send({
      content: prompt,
      components: [buildClaimApprovalRow(channelId, interaction.user.id, currentLocale)],
      allowedMentions: {
        users: [context.tempInfo.ownerId, interaction.user.id],
      },
    });
    return true;
  }

  if (prefix === MY_STATS_PREFIX) {
    if (typeof deps.replyMyStats !== 'function') {
      await interaction.reply({
        content: deps.t(currentLocale, 'lfg.statsNotReady'),
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    await deps.replyMyStats(interaction, { ephemeral: false });
    return true;
  }

  if (prefix === LEADERBOARD_PREFIX) {
    if (typeof deps.replyLeaderboard !== 'function') {
      await interaction.reply({
        content: deps.t(currentLocale, 'lfg.leaderboardNotReady'),
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    await deps.replyLeaderboard(interaction, { ephemeral: false });
    return true;
  }

  const ownerActionPrefixes = new Set([
    CHANNEL_NAME_PREFIX,
    CHANNEL_SIZE_PREFIX,
    CHANNEL_SIZE_RETRY_PREFIX,
    CHANNEL_LOCK_PREFIX,
    CHANNEL_UNLOCK_PREFIX,
    TRANSFER_PREFIX,
    REGION_PREFIX,
  ]);

  if (!ownerActionPrefixes.has(prefix)) {
    return false;
  }

  const context = await getTempVoiceContext(interaction.guild, channelId);
  currentLocale = context.locale || currentLocale;
  if (context.error) {
    await interaction.reply({
      content: context.error,
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (!isOwner(context.tempInfo, interaction.user.id)) {
    await interaction.reply({
      content: deps.t(currentLocale, 'lfg.ownerOnlySettings'),
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (prefix === CHANNEL_NAME_PREFIX) {
    await interaction.showModal(
      buildChannelNameModal(channelId, context.channel.name, currentLocale)
    );
    return true;
  }

  if (prefix === CHANNEL_SIZE_PREFIX || prefix === CHANNEL_SIZE_RETRY_PREFIX) {
    await interaction.showModal(
      buildChannelSizeModal(channelId, context.channel.userLimit ?? 0, currentLocale)
    );
    return true;
  }

  if (prefix === TRANSFER_PREFIX) {
    const transferCandidates = [...context.channel.members.values()]
      .filter((member) => member.id !== context.tempInfo.ownerId)
      .map((member) => ({
        id: member.id,
        displayName: member.displayName || member.user.username,
        user: member.user,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    if (transferCandidates.length === 0) {
      await interaction.reply({
        content: deps.t(currentLocale, 'lfg.noTransferCandidates'),
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    await interaction.reply({
      content: deps.t(currentLocale, 'lfg.selectTransferUser'),
      components: [
        buildTransferMemberSelectRow(channelId, transferCandidates, currentLocale),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (prefix === REGION_PREFIX) {
    const fetched = await deps.client.fetchVoiceRegions();
    const regions = [...fetched.values()].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    await interaction.reply({
      content: deps.t(currentLocale, 'lfg.selectRegion'),
      components: [
        buildRegionSelectRow(channelId, regions, context.channel.rtcRegion, currentLocale),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const overwritePayload =
    prefix === CHANNEL_LOCK_PREFIX
      ? { Connect: false }
      : { Connect: null };

  await context.channel.permissionOverwrites.edit(
    interaction.guildId,
    overwritePayload,
    {
      reason:
        prefix === CHANNEL_LOCK_PREFIX
          ? deps.t(currentLocale, 'lfg.lockedBy', { userId: interaction.user.id })
          : deps.t(currentLocale, 'lfg.unlockedBy', { userId: interaction.user.id }),
    }
  );

    await interaction.reply({
      content:
        prefix === CHANNEL_LOCK_PREFIX
          ? deps.t(currentLocale, 'lfg.channelLocked', { notice: overrideNotice(context.tempInfo) })
          : deps.t(currentLocale, 'lfg.channelUnlocked', { notice: overrideNotice(context.tempInfo) }),
    });
  await refreshJoinToCreatePrompt(interaction.guild, channelId);
  return true;
}

module.exports = { handleButtonInteraction };
