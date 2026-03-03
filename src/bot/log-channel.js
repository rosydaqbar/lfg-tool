function createLogChannelFetcher(client) {
  const CACHE_TTL_MS = 5 * 60 * 1000;
  const MAX_CACHE_SIZE = 200;
  const cache = new Map();

  function evictExpired(now) {
    for (const [channelId, entry] of cache.entries()) {
      if (!entry || entry.expiresAt <= now) {
        cache.delete(channelId);
      }
    }
  }

  function evictOverflow() {
    if (cache.size <= MAX_CACHE_SIZE) return;
    const overflow = cache.size - MAX_CACHE_SIZE;
    let removed = 0;
    for (const key of cache.keys()) {
      cache.delete(key);
      removed += 1;
      if (removed >= overflow) break;
    }
  }

  async function getLogChannel(channelId) {
    if (!channelId) return null;
    const now = Date.now();
    evictExpired(now);

    const cached = cache.get(channelId);
    if (cached && cached.expiresAt > now) {
      return cached.channel;
    }

    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        console.error('Log channel not found or not text-based.');
        cache.delete(channelId);
        return null;
      }
      cache.set(channelId, {
        channel,
        expiresAt: now + CACHE_TTL_MS,
      });
      evictOverflow();
      return channel;
    } catch (error) {
      console.error('Failed to fetch log channel:', error);
      cache.delete(channelId);
      return null;
    }
  }

  return { getLogChannel };
}

module.exports = { createLogChannelFetcher };
