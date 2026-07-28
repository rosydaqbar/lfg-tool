const { MessageFlags } = require('discord.js');
const { LFG_MESSAGE_INPUT_ID } = require('./constants');

async function handleLfgPostModal(interaction, deps, channelId, options = {}) {
  const {
    configStore,
    env,
    getLogChannel,
    getCooldownRemainingMs,
    setCooldown,
    formatCooldown,
    isAdminOverride,
    isOwner,
  } = deps;

  const guildId = options.guildId || interaction.guildId;
  const locale = await deps.getGuildLocale(configStore, guildId);
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
      content: deps.t(locale, 'lfg.squadInactive'),
    });
    return;
  }
  if (!isOwner(tempInfo, interaction.user.id)) {
    await interaction.editReply({
      content: deps.t(locale, 'lfg.ownerOnlyPost'),
    });
    return;
  }

  const overrideNotice = isAdminOverride?.(tempInfo, interaction.user.id)
    ? deps.t(locale, 'common.override')
    : '';
  if (tempInfo.lfgEnabled === false) {
    await interaction.editReply({
      content: deps.t(locale, 'lfg.postDisabled'),
    });
    return;
  }

  if (remaining > 0) {
    await interaction.editReply({
      content: deps.t(locale, 'lfg.cooldown', { duration: formatCooldown(remaining, locale) }),
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
      content: deps.t(locale, 'lfg.logChannelMissing'),
    });
    return;
  }

  const logChannel = await getLogChannel(logChannelId);
  if (!logChannel) {
    await interaction.editReply({
      content: deps.t(locale, 'lfg.logChannelUnavailable'),
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
          deps.t(locale, 'lfg.roleMissing'),
      });
      return;
    }
    const guild = interaction.guild || await deps.client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      await interaction.editReply({
        content: deps.t(locale, 'lfg.serverUnavailable'),
      });
      return;
    }

    const channel = await guild.channels
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
      deps.t(locale, 'lfg.lookingForSquad', { userId: interaction.user.id, voiceLink }),
      '',
    ];
    if (quoteLines.length > 0) {
      lines.push(deps.t(locale, 'lfg.messageHeading'), ...quoteLines, '');
    }
    lines.push(deps.t(locale, 'lfg.createdLine', { timestamp: `<t:${createdTimestamp}:f>` }));
    lines.push(`${deps.t(locale, 'lfg.moreInfoHeading')} <@${interaction.user.id}>`);

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
      content: `${deps.t(locale, 'lfg.postSent')}${overrideNotice}`,
    });
  } catch (error) {
    console.error('Failed to send LFG post:', error);
    await interaction
      .editReply({
        content: deps.t(locale, 'lfg.postFailed'),
      })
      .catch((replyError) => {
        console.error('Failed to reply to LFG modal:', replyError);
      });
  }
}

module.exports = { handleLfgPostModal };
