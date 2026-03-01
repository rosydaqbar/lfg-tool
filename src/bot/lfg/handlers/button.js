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
  LFG_SEND_PREFIX,
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
    buildRegionSelectRow,
    buildTransferMemberSelectRow,
    buildVoiceSettingsRows,
    formatCooldown,
    getCooldownRemainingMs,
    getTempVoiceContext,
    isOwner,
    transferChannelOwner,
    userIsInVoiceChannel,
    refreshJoinToCreatePrompt,
  } = deps;

  const guildId = interaction.guildId;
  if (!guildId || !interaction.guild) {
    await interaction.reply({
      content: 'This action can only be used in a server.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (prefix === LFG_SEND_PREFIX) {
    const tempInfo = await deps.configStore.getTempChannelInfo(channelId);
    if (!tempInfo?.ownerId) {
      await interaction.reply({
        content: 'Channel squad sudah tidak aktif.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    if (!isOwner(tempInfo, interaction.user.id)) {
      await interaction.reply({
        content: 'Hanya pemilik Voice yang bisa mengirim pesan LFG',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    if (tempInfo.lfgEnabled === false) {
      await interaction.reply({
        content: 'Fitur Send LFG Post dinonaktifkan untuk lobby ini.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const remaining = getCooldownRemainingMs(guildId, interaction.user.id);
    if (remaining > 0) {
      await interaction.reply({
        content: `Please wait ${formatCooldown(remaining)} before sending another LFG post.`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    try {
      await interaction.showModal(buildLfgModal(channelId));
    } catch (error) {
      console.error('Failed to show LFG modal:', error);
      await interaction.reply({
        content: 'Unable to open the LFG form right now.',
        flags: MessageFlags.Ephemeral,
      });
    }
    return true;
  }

  if (prefix === LFG_SETTINGS_PREFIX) {
    const context = await getTempVoiceContext(interaction.guild, channelId);
    if (context.error) {
      await interaction.reply({
        content: context.error,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    await interaction.reply({
      content:
        `Pengaturan voice channel <#${channelId}>. ` +
        'Hanya owner yang bisa mengubah setting (kecuali Claim).',
      components: buildVoiceSettingsRows(channelId),
      allowedMentions: { parse: [] },
    });
    return true;
  }

  if (prefix === CLAIM_APPROVE_PREFIX || prefix === CLAIM_DECLINE_PREFIX) {
    const claimerId = arg1;
    const context = await getTempVoiceContext(interaction.guild, channelId);
    if (context.error || !claimerId) {
      await interaction.reply({
        content: context.error || 'Permintaan claim tidak valid.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (!isOwner(context.tempInfo, interaction.user.id)) {
      await interaction.reply({
        content: 'Hanya owner saat ini yang bisa merespon claim.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (prefix === CLAIM_DECLINE_PREFIX) {
      await interaction.update({
        content:
          `Hi <@${context.tempInfo.ownerId}> user <@${claimerId}> ingin mengambil ownership dari voice channel. ` +
          'Permintaan ditolak.',
        components: [],
        allowedMentions: {
          users: [context.tempInfo.ownerId, claimerId],
        },
      });
      return true;
    }

    if (!(await userIsInVoiceChannel(context.channel, claimerId))) {
      await interaction.update({
        content:
          `Hi <@${context.tempInfo.ownerId}> user <@${claimerId}> ingin mengambil ownership dari voice channel. ` +
          'Transfer dibatalkan karena user tidak ada di voice channel.',
        components: [],
        allowedMentions: {
          users: [context.tempInfo.ownerId, claimerId],
        },
      });
      return true;
    }

    await transferChannelOwner(channelId, claimerId);
    await interaction.update({
      content: `Ownership voice channel dipindahkan ke <@${claimerId}>.`,
      components: [],
      allowedMentions: { users: [claimerId] },
    });
    await refreshJoinToCreatePrompt(interaction.guild, channelId);
    return true;
  }

  if (prefix === CLAIM_PREFIX) {
    const context = await getTempVoiceContext(interaction.guild, channelId);
    if (context.error) {
      await interaction.reply({
        content: context.error,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (isOwner(context.tempInfo, interaction.user.id)) {
      await interaction.reply({
        content: 'Kamu pemilik channel ini.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (!(await userIsInVoiceChannel(context.channel, interaction.user.id))) {
      await interaction.reply({
        content: 'Kamu harus berada di voice channel ini untuk claim ownership.',
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
        content: `Owner tidak berada di channel. Ownership otomatis dipindahkan ke <@${interaction.user.id}>.`,
        allowedMentions: { users: [interaction.user.id] },
      });
      await refreshJoinToCreatePrompt(interaction.guild, channelId);
      return true;
    }

    const prompt =
      `Hi <@${context.tempInfo.ownerId}> user <@${interaction.user.id}> ingin mengambil ownership dari voice channel. ` +
      'Transfer kepemilikan channel?';

    await interaction.reply({
      content: 'Permintaan claim dikirim ke owner saat ini.',
      flags: MessageFlags.Ephemeral,
    });

    await interaction.channel.send({
      content: prompt,
      components: [buildClaimApprovalRow(channelId, interaction.user.id)],
      allowedMentions: {
        users: [context.tempInfo.ownerId, interaction.user.id],
      },
    });
    return true;
  }

  if (prefix === MY_STATS_PREFIX) {
    if (typeof deps.replyMyStats !== 'function') {
      await interaction.reply({
        content: 'Fitur stats belum siap. Coba lagi sebentar.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    await deps.replyMyStats(interaction, { ephemeral: false });
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
  if (context.error) {
    await interaction.reply({
      content: context.error,
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (!isOwner(context.tempInfo, interaction.user.id)) {
    await interaction.reply({
      content: 'Hanya owner voice channel yang bisa mengubah setting ini.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (prefix === CHANNEL_NAME_PREFIX) {
    await interaction.showModal(
      buildChannelNameModal(channelId, context.channel.name)
    );
    return true;
  }

  if (prefix === CHANNEL_SIZE_PREFIX || prefix === CHANNEL_SIZE_RETRY_PREFIX) {
    await interaction.showModal(
      buildChannelSizeModal(channelId, context.channel.userLimit ?? 0)
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
        content: 'Tidak ada member lain di voice channel untuk transfer ownership.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    await interaction.reply({
      content: 'Pilih member untuk menerima ownership channel ini.',
      components: [
        buildTransferMemberSelectRow(channelId, transferCandidates),
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
      content: 'Pilih region voice channel.',
      components: [
        buildRegionSelectRow(channelId, regions, context.channel.rtcRegion),
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
          ? `Locked by ${interaction.user.id}`
          : `Unlocked by ${interaction.user.id}`,
    }
  );

  await interaction.reply({
    content:
      prefix === CHANNEL_LOCK_PREFIX
        ? 'Voice channel berhasil dikunci.'
        : 'Voice channel berhasil dibuka.',
  });
  await refreshJoinToCreatePrompt(interaction.guild, channelId);
  return true;
}

module.exports = { handleButtonInteraction };
