const {
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
} = require('discord.js');

function formatDuration(totalMs) {
  const safeMs = Math.max(0, Number(totalMs) || 0);
  const totalMinutes = Math.floor(safeMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const seconds = Math.floor((safeMs % 60000) / 1000);
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return date.toLocaleString();
}

function createVoiceLogger({ getLogChannel, env, debugLog }) {
  async function logManualLeave({
    guildId,
    userId,
    channelId,
    channelName,
    leftAt,
    totalMs,
  }, config) {
    if (!guildId) {
      debugLog('Skip: missing guild id');
      return;
    }

    const logChannelId = config.logChannelId || env.LOG_CHANNEL_ID;
    if (!logChannelId) {
      debugLog('Skip: no log channel configured', { guildId });
      return;
    }

    const logChannel = await getLogChannel(logChannelId);
    if (!logChannel) return;

    const body = [
      '### Manual Voice Session Leave',
      `- User: <@${userId}> (\`${userId}\`)`,
      `- Channel: ${channelName || '(unknown)'} (\`${channelId}\`)`,
      `- Left at: ${formatDateTime(leftAt)}`,
      `- Session: ${formatDuration(totalMs)}`,
    ].join('\n');

    const container = new ContainerBuilder()
      .setAccentColor(0xf59e0b)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(body));

    try {
      await logChannel.send({
        flags: MessageFlags.IsComponentsV2,
        components: [container],
        allowedMentions: { users: [userId] },
      });
    } catch (error) {
      console.error('Failed to send manual leave log:', error);
    }
  }

  return { logManualLeave };
}

module.exports = { createVoiceLogger };
