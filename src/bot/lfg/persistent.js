const { MessageFlags, Routes } = require('discord.js');
const { PERSISTENT_LFG_INTERVAL_MS } = require('./constants');
const { buildPersistentLfgPanelPayload } = require('./builders');
const { getChannelInvite, notifyAdminInviteUnavailable } = require('./invites');
const { t } = require('../../i18n');

function createPersistentLfgManager({ client, configStore, env }) {
  const persistentLfgRunning = new Set();
  let persistentInterval = null;

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
      let config = null;
      try {
        config = await configStore.getGuildConfig(guildId);
      } catch (error) {
        console.warn(
          'Persistent LFG refresh skipped: failed to read dashboard config. Will retry on the next loop.',
          error?.message || error
        );
        return;
      }

      const lobbyIds = config.lfgEnabledLobbyIds || [];
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

      const locale = config.locale || 'en';
      const lobbyItems = [];
      const failedLobbyIds = [];
      for (const id of lobbyIds) {
        const inviteInfo = await getChannelInvite(client, id);
        if (inviteInfo) {
          lobbyItems.push(inviteInfo);
        } else {
          failedLobbyIds.push(id);
        }
      }
      for (const id of failedLobbyIds) {
        await notifyAdminInviteUnavailable({
          client,
          channelId: id,
          logChannelId: targetChannelId,
          locale,
          t,
        });
      }
      const panelPayload = await buildPersistentLfgPanelPayload({
        client,
        configStore,
        guildId,
        locale,
        lobbyItems,
      });

      const latest = await channel.messages.fetch({ limit: 1 }).catch(() => null);
      const latestMessage = latest?.first?.();
      const latestMessageId = latestMessage?.id ?? null;

      if (record && record.channelId === channel.id) {
        const existing = await channel.messages
          .fetch(record.messageId)
          .catch(() => null);
        if (existing && latestMessageId === record.messageId) {
          const isV2 = existing.flags?.has(MessageFlags.IsComponentsV2);
          if (isV2) {
            await existing.edit({ ...panelPayload, allowedMentions: { parse: [] } });
            await configStore.setPersistentLfgMessage(guildId, channel.id, record.messageId);
            return;
          }

          const promoted = await client.rest
            .patch(Routes.channelMessage(channel.id, existing.id), {
              body: {
                content: null,
                embeds: [],
                components: (panelPayload.components || []).map((c) =>
                  c && typeof c.toJSON === 'function' ? c.toJSON() : c
                ),
                flags: MessageFlags.IsComponentsV2,
                allowed_mentions: { parse: [] },
              },
            })
            .then(() => true)
            .catch((error) => {
              console.warn('Persistent LFG V2 promotion failed, replacing message instead:', error?.message || error);
              return false;
            });

          if (promoted) {
            await configStore.setPersistentLfgMessage(guildId, channel.id, record.messageId);
            return;
          }

          const sent = await channel.send({ ...panelPayload, allowedMentions: { parse: [] } });
          if (existing.pinned) await sent.pin().catch(() => null);
          await tryDeleteMessage(record.channelId, record.messageId);
          await configStore.setPersistentLfgMessage(guildId, channel.id, sent.id);
          return;
        }
      }

      const sent = await channel.send({ ...panelPayload, allowedMentions: { parse: [] } });
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
