function createLogChannelFetcher(client) {
  const cache = new Map();

  async function getLogChannel(channelId) {
    if (!channelId) return null;
    if (cache.has(channelId)) return cache.get(channelId);

    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        console.error('Log channel not found or not text-based.');
        return null;
      }
      cache.set(channelId, channel);
      return channel;
    } catch (error) {
      console.error('Failed to fetch log channel:', error);
      return null;
    }
  }

  return { getLogChannel };
}

module.exports = { createLogChannelFetcher };
