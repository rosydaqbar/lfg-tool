const INVITE_TTL_MS = 10 * 60 * 1000;

const inviteCache = new Map();
const inviteFailures = new Map();
const inviteRequests = new Map();
const notifiedChannelIds = new Set();

async function getChannelInviteUrl(client, channelId) {
  const now = Date.now();
  const cached = inviteCache.get(channelId);
  if (cached && now - cached.fetchedAt < INVITE_TTL_MS) {
    return cached.url;
  }

  const failedAt = inviteFailures.get(channelId);
  if (failedAt && now - failedAt < INVITE_TTL_MS) {
    return null;
  }

  const inFlight = inviteRequests.get(channelId);
  if (inFlight) return inFlight;

  const request = (async () => {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel) {
        inviteFailures.set(channelId, now);
        return null;
      }

      const invite = await channel.createInvite({ maxAge: 0, maxUses: 0 });
      inviteCache.set(channelId, { url: invite.url, fetchedAt: Date.now() });
      inviteFailures.delete(channelId);
      return invite.url;
    } catch (error) {
      inviteFailures.set(channelId, now);
      return null;
    } finally {
      inviteRequests.delete(channelId);
    }
  })();
  inviteRequests.set(channelId, request);
  return request;
}

async function notifyAdminInviteUnavailable({
  client,
  channelId,
  logChannelId,
  locale,
  t,
}) {
  if (notifiedChannelIds.has(channelId)) return;
  notifiedChannelIds.add(channelId);

  const channel = await client.channels.fetch(logChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;

  await channel.send({
    content: t(locale, 'lfg.inviteUnavailableAdmin', { channelId }),
    allowedMentions: { parse: [] },
  }).catch(() => null);
}

module.exports = { getChannelInviteUrl, notifyAdminInviteUnavailable };
