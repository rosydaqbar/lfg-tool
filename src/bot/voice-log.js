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

function formatSummaryDuration(totalMs) {
  const safeMs = Math.max(0, Number(totalMs) || 0);
  const totalMinutes = Math.floor(safeMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return date.toLocaleString();
}

function buildVoiceActivitySummaryBody(activity) {
  const active = (activity?.active || []).slice(0, 10);
  const history = (activity?.history || []).slice(0, 10);

  const activeLines = active.length
    ? active.map(
      (row) => `- <@${row.userId}> • masuk: ${row.joinedAt ? `<t:${Math.floor(row.joinedAt.getTime() / 1000)}:R>` : '-'}`
    )
    : ['- Tidak ada user aktif'];

  const historyLines = history.length
    ? history.map(
      (row) => `- <@${row.userId}> • total: \`${formatSummaryDuration(row.totalMs)}\``
    )
    : ['- Belum ada history'];

  if ((activity?.activeCount || 0) > active.length) {
    activeLines.push(`- ...dan ${(activity.activeCount || 0) - active.length} lainnya`);
  }

  if ((activity?.historyCount || 0) > history.length) {
    historyLines.push(`- ...dan ${(activity.historyCount || 0) - history.length} lainnya`);
  }

  return [
    '### Voice Log',
    '-# Pantau siapa yang sedang aktif di voice channel ini dan riwayat durasi user yang sudah keluar.',
    '',
    '**Aktif Saat Ini**',
    ...activeLines,
    '',
    '**History**',
    ...historyLines,
  ].join('\n');
}

function createVoiceLogger({ getLogChannel, env, debugLog, configStore }) {
  function buildManualPanelPayload(activity) {
    const body = buildVoiceActivitySummaryBody(activity);

    const container = new ContainerBuilder()
      .setAccentColor(0x0ea5e9)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(body));

    return {
      flags: MessageFlags.IsComponentsV2,
      components: [container],
      allowedMentions: { parse: [], users: [] },
    };
  }

  async function sendManualSessionPanel(voiceChannel, { activity }) {
    if (!voiceChannel || typeof voiceChannel.send !== 'function') {
      return;
    }

    const payload = buildManualPanelPayload(activity);

    try {
      if (configStore?.getManualVoicePanelMessage) {
        const existingMessageId = await configStore
          .getManualVoicePanelMessage(voiceChannel.guild?.id, voiceChannel.id)
          .catch(() => null);
        if (existingMessageId && voiceChannel?.messages?.fetch) {
          await voiceChannel.messages.fetch(existingMessageId)
            .then((message) => message.delete().catch(() => null))
            .catch(() => null);
        }
      }

      const message = await voiceChannel.send(payload);

      if (configStore?.setManualVoicePanelMessage) {
        await configStore
          .setManualVoicePanelMessage(
            voiceChannel.guild?.id,
            voiceChannel.id,
            message.id
          )
          .catch((error) => {
            console.error('Failed to store manual voice panel message:', error);
          });
      }
    } catch (error) {
      console.error('Failed to send manual session panel:', error);
    }
  }

  async function refreshManualSessionPanel(voiceChannel, { activity }) {
    if (!voiceChannel || typeof voiceChannel.send !== 'function') {
      return;
    }

    const guildId = voiceChannel.guild?.id;
    if (!guildId || !configStore?.getManualVoicePanelMessage) {
      await sendManualSessionPanel(voiceChannel, { activity });
      return;
    }

    const payload = buildManualPanelPayload(activity);
    const messageId = await configStore
      .getManualVoicePanelMessage(guildId, voiceChannel.id)
      .catch(() => null);

    if (messageId && voiceChannel?.messages?.fetch) {
      const edited = await voiceChannel.messages.fetch(messageId)
        .then(async (message) => {
          await message.edit(payload);
          return true;
        })
        .catch(() => false);
      if (edited) {
        return;
      }
      await configStore
        .clearManualVoicePanelMessage(guildId, voiceChannel.id)
        .catch(() => null);
    }

    await sendManualSessionPanel(voiceChannel, { activity });
  }

  async function clearManualSessionPanel({ guildId, channelId, voiceChannel }) {
    if (!guildId || !channelId || !configStore?.getManualVoicePanelMessage) {
      return;
    }

    const messageId = await configStore
      .getManualVoicePanelMessage(guildId, channelId)
      .catch((error) => {
        console.error('Failed to load manual voice panel message id:', error);
        return null;
      });

    if (!messageId) {
      return;
    }

    if (voiceChannel?.messages?.fetch) {
      await voiceChannel.messages.fetch(messageId)
        .then((message) => message.delete().catch(() => null))
        .catch(() => null);
    }

    await configStore
      .clearManualVoicePanelMessage(guildId, channelId)
      .catch((error) => {
        console.error('Failed to clear manual voice panel message id:', error);
      });
  }

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
        allowedMentions: { parse: [], users: [] },
      });
    } catch (error) {
      console.error('Failed to send manual leave log:', error);
    }
  }

  return {
    logManualLeave,
    sendManualSessionPanel,
    refreshManualSessionPanel,
    clearManualSessionPanel,
  };
}

module.exports = { createVoiceLogger };
