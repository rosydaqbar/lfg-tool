const { PERSISTENT_LFG_INTERVAL_MS } = require('./constants');
const { buildPersistentLfgEmbed } = require('./builders');

function createPersistentLfgManager({ client, configStore, env }) {
  const persistentLfgRunning = new Set();
  let persistentInterval = null;

  function buildPersistentLfgContent(guildId, lobbyIds) {
    if (!lobbyIds.length) return null;
    const links = lobbyIds.map(
      (id) => `https://discordapp.com/channels/${guildId}/${id}`
    );
    return [
      '### Buat atau cari squad',
      'Untuk mencari teman/squad baru, silahkan buat voice channel terlebih dahulu:',
      links.join(' '),
    ].join('\n');
  }

  async function tryDeleteMessage(channelId, messageId) {
    if (!channelId || !messageId) return;
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;
    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message) return;
    await message.delete().catch(() => null);
  }

  async function ensurePersistentLfgMessage(guildId) {
    if (!guildId || persistentLfgRunning.has(guildId)) return;
    persistentLfgRunning.add(guildId);

    try {
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

      const lobbyIds = config.joinToCreateLobbyIds || [];
      const record = await configStore.getPersistentLfgMessage(guildId);

      if (lobbyIds.length === 0) {
        if (record) {
          await tryDeleteMessage(record.channelId, record.messageId);
          await configStore.clearPersistentLfgMessage(guildId);
        }
        return;
      }

      const targetChannelId =
        config.lfgChannelId || config.logChannelId || env.LOG_CHANNEL_ID;
      if (!targetChannelId) {
        console.error('Persistent LFG message skipped: no LFG/log channel set.');
        return;
      }

      const channel = await client.channels
        .fetch(targetChannelId)
        .catch(() => null);
      if (!channel || !channel.isTextBased()) {
        console.error('Persistent LFG message skipped: channel not text-based.');
        return;
      }

      const content = buildPersistentLfgContent(guildId, lobbyIds);
      if (!content) return;
      const embed = await buildPersistentLfgEmbed({
        client,
        configStore,
        guildId,
      });

      const latest = await channel.messages.fetch({ limit: 1 }).catch(() => null);
      const latestMessage = latest?.first?.();
      const latestMessageId = latestMessage?.id ?? null;

      if (record && record.channelId === channel.id) {
        const existing = await channel.messages
          .fetch(record.messageId)
          .catch(() => null);
        if (existing && latestMessageId === record.messageId) {
          await existing.edit({ content, embeds: [embed] });
          await configStore.setPersistentLfgMessage(
            guildId,
            channel.id,
            record.messageId
          );
          return;
        }
      }

      const sent = await channel.send({ content, embeds: [embed] });
      if (record) {
        await tryDeleteMessage(record.channelId, record.messageId);
      }
      await configStore.setPersistentLfgMessage(guildId, channel.id, sent.id);
    } catch (error) {
      console.error('Failed to ensure persistent LFG message:', error);
    } finally {
      persistentLfgRunning.delete(guildId);
    }
  }

  function startPersistentLoop() {
    const run = async () => {
      for (const guild of client.guilds.cache.values()) {
        await ensurePersistentLfgMessage(guild.id);
      }
    };

    run();
    if (persistentInterval) clearInterval(persistentInterval);
    persistentInterval = setInterval(run, PERSISTENT_LFG_INTERVAL_MS);
  }

  function stopPersistentLoop() {
    if (!persistentInterval) return;
    clearInterval(persistentInterval);
    persistentInterval = null;
  }

  return {
    ensurePersistentLfgMessage,
    startPersistentLoop,
    stopPersistentLoop,
  };
}

module.exports = { createPersistentLfgManager };
