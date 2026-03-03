function createVoiceLogger({ getLogChannel, env, debugLog, configStore }) {
  async function logJoin(newState, config, options = {}) {
    const guildId = newState.guild?.id;
    if (!guildId) {
      debugLog('Skip: missing guild id');
      return;
    }

    const enabledVoiceIds = config.enabledVoiceChannelIds || [];
    const logChannelId = config.logChannelId || env.LOG_CHANNEL_ID;

    if (!logChannelId) {
      debugLog('Skip: no log channel configured', { guildId });
      return;
    }

    let isTempChannel = options.isTempChannel === true;
    if (!isTempChannel && newState.channelId && configStore?.getTempChannelInfo) {
      const tempInfo = await configStore
        .getTempChannelInfo(newState.channelId)
        .catch(() => null);
      isTempChannel = Boolean(tempInfo?.ownerId);
    }

    const manuallyEnabled = enabledVoiceIds.includes(newState.channelId);
    const matchesEnvFallback =
      enabledVoiceIds.length === 0
      && env.VOICE_CHANNEL_ID
      && newState.channelId === env.VOICE_CHANNEL_ID;

    const shouldLog = isTempChannel || manuallyEnabled || matchesEnvFallback;
    if (!shouldLog) {
      if (enabledVoiceIds.length > 0) {
        debugLog('Skip: voice channel not enabled', {
          enabledCount: enabledVoiceIds.length,
          got: newState.channelId,
        });
      } else if (env.VOICE_CHANNEL_ID) {
        debugLog('Skip: voice channel mismatch', {
          expected: env.VOICE_CHANNEL_ID,
          got: newState.channelId,
        });
      } else {
        debugLog('Skip: voice channel not eligible for logging', {
          got: newState.channelId,
        });
      }
      return;
    }

    const channel = await getLogChannel(logChannelId);
    if (!channel) return;

    const message = `Voice Join: userId=${newState.id} voiceChannelId=${newState.channelId}`;

    try {
      await channel.send(message);
    } catch (error) {
      console.error('Failed to send log message:', error);
    }
  }

  return { logJoin };
}

module.exports = { createVoiceLogger };
