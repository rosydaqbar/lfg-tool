const { getGuildLocale, t } = require('../../i18n');

function createVoiceContextHelpers(configStore) {
  const privilegedOwnerId =
    typeof process.env.ADMIN_DISCORD_USER_ID === 'string'
      ? process.env.ADMIN_DISCORD_USER_ID.trim()
      : '';

  async function getTempVoiceContext(guild, channelId) {
    const locale = await getGuildLocale(configStore, guild?.id);
    const tempInfo = await configStore.getTempChannelInfo(channelId);
    if (!tempInfo?.ownerId) {
      return { error: t(locale, 'lfg.squadInactive'), locale };
    }

    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isVoiceBased()) {
      return { error: t(locale, 'lfg.voiceNotFound'), locale };
    }

    return { tempInfo, channel, locale };
  }

  function isOwner(tempInfo, userId) {
    if (privilegedOwnerId && userId === privilegedOwnerId) {
      return true;
    }
    return tempInfo?.ownerId && tempInfo.ownerId === userId;
  }

  function isAdminOverride(tempInfo, userId) {
    if (!privilegedOwnerId || userId !== privilegedOwnerId) return false;
    return Boolean(tempInfo?.ownerId && tempInfo.ownerId !== userId);
  }

  async function transferChannelOwner(channelId, newOwnerId) {
    await configStore.updateTempChannelOwner(channelId, newOwnerId);
  }

  async function userIsInVoiceChannel(channel, userId) {
    return channel.members.has(userId);
  }

  return {
    getTempVoiceContext,
    isAdminOverride,
    isOwner,
    transferChannelOwner,
    userIsInVoiceChannel,
  };
}

module.exports = { createVoiceContextHelpers };
