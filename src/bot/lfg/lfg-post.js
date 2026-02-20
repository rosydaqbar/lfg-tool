const { MessageFlags } = require('discord.js');
const { LFG_MESSAGE_INPUT_ID } = require('./constants');

async function handleLfgPostModal(interaction, deps, channelId) {
  const {
    configStore,
    env,
    getLogChannel,
    getCooldownRemainingMs,
    setCooldown,
    formatCooldown,
    isOwner,
  } = deps;

  const guildId = interaction.guildId;
  const remaining = getCooldownRemainingMs(guildId, interaction.user.id);
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  } catch (error) {
    console.error('Failed to defer LFG modal reply:', error);
    return;
  }

  const tempInfo = await configStore.getTempChannelInfo(channelId);
  if (!tempInfo?.ownerId) {
    await interaction.editReply({
      content: 'Channel squad sudah tidak aktif.',
    });
    return;
  }
  if (!isOwner(tempInfo, interaction.user.id)) {
    await interaction.editReply({
      content: 'Hanya pemilik Voice yang bisa mengirim pesan LFG',
    });
    return;
  }
  if (tempInfo.lfgEnabled === false) {
    await interaction.editReply({
      content: 'Fitur Send LFG Post dinonaktifkan untuk lobby ini.',
    });
    return;
  }

  if (remaining > 0) {
    await interaction.editReply({
      content: `Please wait ${formatCooldown(remaining)} before sending another LFG post.`,
    });
    return;
  }

  let config = {
    logChannelId: null,
    lfgChannelId: null,
    enabledVoiceChannelIds: [],
    joinToCreateLobbyIds: [],
  };
  try {
    config = await configStore.getGuildConfig(guildId);
  } catch (error) {
    console.error('Failed to read dashboard config:', error);
  }

  const logChannelId =
    config.lfgChannelId || config.logChannelId || env.LOG_CHANNEL_ID;
  if (!logChannelId) {
    await interaction.editReply({
      content: 'No log channel is configured.',
    });
    return;
  }

  const logChannel = await getLogChannel(logChannelId);
  if (!logChannel) {
    await interaction.editReply({
      content: 'Unable to access the log channel.',
    });
    return;
  }

  try {
    const rawCustomMessage = interaction.fields.getTextInputValue(
      LFG_MESSAGE_INPUT_ID
    );
    const customMessage = rawCustomMessage.trim();
    const roleId = tempInfo?.roleId ?? null;
    if (!roleId) {
      await interaction.editReply({
        content:
          'Role LFG untuk lobby ini belum dikonfigurasi. Hubungi admin.',
      });
      return;
    }
    const channel = await interaction.guild.channels
      .fetch(channelId)
      .catch(() => null);
    const createdTimestamp = Math.floor(
      (channel?.createdTimestamp ?? Date.now()) / 1000
    );
    const voiceLink = `https://discordapp.com/channels/${guildId}/${channelId}`;
    const quoteLines = customMessage
      ? customMessage
          .split(/\r?\n/)
          .map((line) => `> ${line}`)
      : [];
    const lines = [
      `-# <@&${roleId}>`,
      `<@${interaction.user.id}> sedang mencari squad, join: ${voiceLink}`,
      '',
    ];
    if (quoteLines.length > 0) {
      lines.push('-# Pesan:', ...quoteLines, '');
    }
    lines.push(`-# Dibuat pada: <t:${createdTimestamp}:f>`);
    lines.push(`-# Info lebih lanjut: <@${interaction.user.id}>`);

    const lfgMessage = await logChannel.send({
      content: lines.join('\n'),
      allowedMentions: { roles: [roleId], users: [interaction.user.id] },
    });
    await configStore.updateTempChannelMessage(
      channelId,
      logChannelId,
      lfgMessage.id
    );
    setCooldown(guildId, interaction.user.id);
    await interaction.editReply({
      content: 'LFG post sent.',
    });
  } catch (error) {
    console.error('Failed to send LFG post:', error);
    await interaction
      .editReply({
        content: 'Failed to send the LFG post.',
      })
      .catch((replyError) => {
        console.error('Failed to reply to LFG modal:', replyError);
      });
  }
}

module.exports = { handleLfgPostModal };
