function createVoiceContextHelpers(configStore) {
  async function getTempVoiceContext(guild, channelId) {
    const tempInfo = await configStore.getTempChannelInfo(channelId);
    if (!tempInfo?.ownerId) {
      return { error: 'Channel squad sudah tidak aktif.' };
    }

    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isVoiceBased()) {
      return { error: 'Voice channel tidak ditemukan.' };
    }

    return { tempInfo, channel };
  }

  function isOwner(tempInfo, userId) {
    return tempInfo?.ownerId && tempInfo.ownerId === userId;
  }

  async function transferChannelOwner(channelId, newOwnerId) {
    await configStore.updateTempChannelOwner(channelId, newOwnerId);
  }

  async function userIsInVoiceChannel(channel, userId) {
    return channel.members.has(userId);
  }

  return {
    getTempVoiceContext,
    isOwner,
    transferChannelOwner,
    userIsInVoiceChannel,
  };
}

module.exports = { createVoiceContextHelpers };
