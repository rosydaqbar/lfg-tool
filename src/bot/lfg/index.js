const {
  buildJoinToCreatePromptPayload,
  buildChannelNameModal,
  buildChannelSizeModal,
  buildChannelSizeRetryRow,
  buildClaimApprovalRow,
  buildLfgModal,
  buildRegionSelectRow,
  buildTransferMemberSelectRow,
  buildVoiceSettingsRows,
} = require('./builders');
const { createCooldownTracker } = require('./cooldown');
const { createVoiceContextHelpers } = require('./context');
const { handleButtonInteraction } = require('./handlers/button');
const { handleModalInteraction } = require('./handlers/modal');
const { handleSelectInteraction } = require('./handlers/select');
const { createPersistentLfgManager } = require('./persistent');
const {
  CHANNEL_NAME_PREFIX,
  CHANNEL_SIZE_PREFIX,
  CHANNEL_LOCK_PREFIX,
  CHANNEL_UNLOCK_PREFIX,
  CLAIM_PREFIX,
  REGION_PREFIX,
  TRANSFER_PREFIX,
  LFG_SEND_PREFIX,
  MY_STATS_PREFIX,
  LEADERBOARD_PREFIX,
  JTC_PROMPT_RECONCILE_INTERVAL_MS,
} = require('./constants');

function createLfgManager({ client, getLogChannel, configStore, env, statsManager }) {
  const tempPromptMessageIds = new Map();
  const persistentRefreshAtByGuild = new Map();
  const promptUpdateInFlight = new Map();
  let promptReconcileInterval = null;
  let promptReconcileRunning = false;
  const cooldownTracker = createCooldownTracker();
  const voiceContextHelpers = createVoiceContextHelpers(configStore);
  const persistentManager = createPersistentLfgManager({
    client,
    configStore,
    env,
  });

  async function refreshPersistentLfgForGuild(guildId) {
    if (!guildId) return;
    const now = Date.now();
    const refreshAt = persistentRefreshAtByGuild.get(guildId) || 0;
    if (refreshAt > now) return;
    persistentRefreshAtByGuild.set(guildId, now + 10_000);
    await persistentManager.ensurePersistentLfgMessage(guildId).catch((error) => {
      console.error('Failed to refresh persistent LFG message:', error);
    });
  }

  function setPromptMessageId(channelId, messageId) {
    if (!channelId || !messageId) return;
    tempPromptMessageIds.set(channelId, messageId);
  }

  async function clearPromptMessageId(channelId) {
    if (!channelId) return;
    tempPromptMessageIds.delete(channelId);
    await configStore
      .updateTempChannelPromptMessage(channelId, null)
      .catch((error) => {
        console.error('Failed to clear Join-to-Create prompt message ID:', error);
      });
  }

  async function rememberPromptMessageId(channelId, messageId) {
    if (!channelId || !messageId) return;
    setPromptMessageId(channelId, messageId);
    await configStore
      .updateTempChannelPromptMessage(channelId, messageId)
      .catch((error) => {
        console.error('Failed to persist Join-to-Create prompt message ID:', error);
      });
  }

  async function withPromptLock(channelId, operation) {
    if (!channelId) {
      return operation();
    }

    const previous = promptUpdateInFlight.get(channelId) || Promise.resolve();
    const next = previous
      .catch(() => null)
      .then(() => operation());

    promptUpdateInFlight.set(channelId, next);
    try {
      return await next;
    } finally {
      if (promptUpdateInFlight.get(channelId) === next) {
        promptUpdateInFlight.delete(channelId);
      }
    }
  }

  function getDiscordErrorCode(error) {
    return error?.code || error?.rawError?.code || error?.data?.code || null;
  }

  function describePromptError(error) {
    const code = getDiscordErrorCode(error);
    if (code === 10003) {
      return {
        expected: true,
        reason: 'Discord says the temp channel no longer exists or is not accessible.',
        action: 'Cleared the saved prompt reference. This usually happens after a temp voice channel is deleted.',
      };
    }
    if (code === 10008) {
      return {
        expected: true,
        reason: 'Discord says the saved prompt message no longer exists.',
        action: 'Cleared the saved prompt reference so a new prompt can be created when needed.',
      };
    }
    if (code === 'ChannelNotCached') {
      return {
        expected: true,
        reason: 'The prompt message points to a channel that is no longer in the bot cache.',
        action: 'Cleared the saved prompt reference. The next refresh will use the current channel state.',
      };
    }
    if (code === 50001 || code === 50013) {
      return {
        expected: true,
        reason: 'The bot cannot access or edit the prompt in that channel.',
        action: 'Check the bot permissions for View Channel, Send Messages, and Manage Messages if this channel still exists.',
      };
    }

    return {
      expected: false,
      reason: error?.message || 'Unexpected Discord error.',
      action: 'The full error is included for debugging.',
    };
  }

  function logPromptRefreshIssue(context, error) {
    const description = describePromptError(error);
    const details = {
      guildId: context.guildId,
      channelId: context.channelId,
      messageId: context.messageId,
      code: getDiscordErrorCode(error) || '-',
      reason: description.reason,
      nextStep: description.action,
    };

    if (description.expected) {
      console.error('Join-to-Create prompt refresh skipped:', details);
      return;
    }

    console.error('Join-to-Create prompt refresh failed unexpectedly:', details, error);
  }

  function logPromptSendIssue(title, context, error) {
    const description = describePromptError(error);
    const details = {
      guildId: context.guildId,
      channelId: context.channelId,
      ownerId: context.ownerId,
      previousMessageId: context.previousMessageId,
      code: getDiscordErrorCode(error) || '-',
      reason: description.reason,
      nextStep: description.action,
    };

    if (description.expected) {
      console.error(title, details);
      return;
    }

    console.error(title, details, error);
  }

  function isVoiceChannelLocked(channel, guild) {
    const everyoneId = guild?.roles?.everyone?.id;
    if (!everyoneId) return false;
    const overwrite = channel.permissionOverwrites.cache.get(everyoneId);
    if (!overwrite) return false;
    return overwrite.deny.has('Connect');
  }

  async function getVoiceActivitySnapshot(channel) {
    if (!channel?.id) {
      return { active: [], history: [], activeCount: 0, historyCount: 0 };
    }

    const channelId = channel.id;
    const guild = channel.guild;
    const rows = await configStore.getVoiceActivity(channelId).catch(() => []);
    const cachedMemberIds = new Set(channel.members?.keys?.() || []);
    const activeRows = rows.filter((row) => row.isActive);
    const activeByUserId = new Map(activeRows.map((row) => [row.userId, row]));

    const candidateUserIds = new Set([
      ...cachedMemberIds,
      ...activeRows.map((row) => row.userId),
    ]);

    const checks = await Promise.all(
      [...candidateUserIds].map(async (userId) => {
        try {
          const member = await guild.members.fetch(userId);
          return [userId, member?.voice?.channelId === channelId];
        } catch {
          return [userId, false];
        }
      })
    );

    const memberIds = new Set(
      checks.filter(([, isInChannel]) => isInChannel).map(([userId]) => userId)
    );

    const active = [];
    for (const userId of memberIds) {
      const row = activeByUserId.get(userId);
      if (row) {
        active.push(row);
        continue;
      }

      active.push({
        userId,
        joinedAt: null,
        totalMs: 0,
        isActive: true,
      });

      configStore.upsertVoiceJoin(channelId, userId, new Date()).catch((error) => {
        console.error('Failed to repair missing active voice row:', error);
      });
    }

    for (const row of activeRows) {
      if (memberIds.has(row.userId)) continue;
      configStore.markVoiceLeave(channelId, row.userId, new Date()).catch((error) => {
        console.error('Failed to repair stale active voice row:', error);
      });
    }

    const history = rows.filter(
      (row) => !row.isActive && !memberIds.has(row.userId)
    );
    return {
      active,
      history,
      activeCount: active.length,
      historyCount: history.length,
    };
  }

  function collectCustomIds(components, ids = []) {
    if (!Array.isArray(components) || components.length === 0) return ids;
    for (const component of components) {
      if (component?.customId) {
        ids.push(component.customId);
      }
      collectCustomIds(component?.components, ids);
    }
    return ids;
  }

  function isPromptMessageForChannel(message, channelId) {
    if (!message || !channelId) return false;
    if (message.author?.id !== client.user?.id) return false;

    const expectedPrefixes = [
      CHANNEL_NAME_PREFIX,
      CHANNEL_SIZE_PREFIX,
      CHANNEL_LOCK_PREFIX,
      CHANNEL_UNLOCK_PREFIX,
      CLAIM_PREFIX,
      REGION_PREFIX,
      TRANSFER_PREFIX,
      LFG_SEND_PREFIX,
      MY_STATS_PREFIX,
      LEADERBOARD_PREFIX,
    ];
    const customIds = collectCustomIds(message.components);
    return expectedPrefixes.some((prefix) =>
      customIds.some((customId) => customId === `${prefix}:${channelId}`)
    );
  }

  async function findPromptMessage(channel, channelId) {
    if (!channel || typeof channel.messages?.fetch !== 'function') return null;
    const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
    if (!recent) return null;

    return (
      recent.find((msg) =>
        isPromptMessageForChannel(msg, channelId)
      ) || null
    );
  }

  async function refreshJoinToCreatePrompt(guild, channelId) {
    if (!guild || !channelId) return;

    return withPromptLock(channelId, async () => {

      const tempInfo = await configStore
        .getTempChannelInfo(channelId)
        .catch(() => null);
      if (!tempInfo?.ownerId) return;

      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (!channel || !channel.isTextBased()) return;

      const config = await configStore.getGuildConfig(guild.id).catch(() => null);
      const lfgEnabled = tempInfo.lfgEnabled ?? true;
      const lfgChannelId =
        config?.lfgChannelId || config?.logChannelId || env.LOG_CHANNEL_ID || null;
      if (lfgEnabled && !lfgChannelId) return;

      const payload = buildJoinToCreatePromptPayload({
        channelId,
        createdTimestamp: Math.floor(
          (channel.createdTimestamp ?? Date.now()) / 1000
        ),
        isLocked: isVoiceChannelLocked(channel, guild),
        lfgEnabled,
        lfgChannelId,
        memberCount: channel.members?.size ?? 0,
        ownerId: tempInfo.ownerId,
        userLimit: channel.userLimit ?? 0,
        voiceActivity: await getVoiceActivitySnapshot(channel),
        refreshedAtTimestamp: Math.floor(Date.now() / 1000),
      });

      let message = null;
      const knownMessageId =
        tempPromptMessageIds.get(channelId) || tempInfo.promptMessageId || null;
      if (knownMessageId) {
        message = await channel.messages.fetch(knownMessageId).catch(() => null);
        if (message && !isPromptMessageForChannel(message, channelId)) {
          await clearPromptMessageId(channelId);
          message = null;
        }
      }
      if (!message) {
        message = await findPromptMessage(channel, channelId);
        if (message?.id) {
          await rememberPromptMessageId(channelId, message.id);
        }
      }
      if (!message) {
        const sent = await channel.send({
          ...payload,
          allowedMentions: { users: [tempInfo.ownerId] },
        }).catch((error) => {
          logPromptSendIssue('Join-to-Create prompt send skipped:', {
            guildId: guild.id,
            channelId,
            ownerId: tempInfo.ownerId,
          }, error);
          return null;
        });
        if (sent?.id) {
          await rememberPromptMessageId(channelId, sent.id);
        }
        await refreshPersistentLfgForGuild(guild.id);
        return;
      }

      const { flags: _ignoredFlags, ...editPayload } = payload;

      const edited = await message
        .edit({
          ...editPayload,
          allowedMentions: { parse: [] },
        })
        .then(() => true)
        .catch(async (error) => {
          logPromptRefreshIssue({
            guildId: guild.id,
            channelId,
            messageId: message.id,
          }, error);
          if (describePromptError(error).expected) {
            await clearPromptMessageId(channelId);
          }
          return false;
        });

      if (edited) {
        await rememberPromptMessageId(channelId, message.id);
        await refreshPersistentLfgForGuild(guild.id);
        return;
      }

      const sent = await channel.send({
        ...payload,
        allowedMentions: { users: [tempInfo.ownerId] },
      }).catch((error) => {
        logPromptSendIssue('Join-to-Create prompt resend skipped:', {
          guildId: guild.id,
          channelId,
          ownerId: tempInfo.ownerId,
          previousMessageId: message.id,
        }, error);
        return null;
      });
      if (sent?.id) {
        await rememberPromptMessageId(channelId, sent.id);
      }
      await refreshPersistentLfgForGuild(guild.id);
    });
  }

  const sharedDeps = {
    ...cooldownTracker,
    ...voiceContextHelpers,
    refreshJoinToCreatePrompt,
    buildJoinToCreatePromptPayload,
    buildChannelNameModal,
    buildChannelSizeModal,
    buildChannelSizeRetryRow,
    buildClaimApprovalRow,
    buildLfgModal,
    buildRegionSelectRow,
    buildTransferMemberSelectRow,
    buildVoiceSettingsRows,
    client,
    configStore,
    env,
    getLogChannel,
    replyLeaderboard: statsManager?.replyLeaderboard,
    replyMyStats: statsManager?.replyMyStats,
  };

  async function sendJoinToCreatePrompt(
    channel,
    member,
    lfgChannelId,
    lfgEnabled = true
  ) {
    if (!channel || typeof channel.send !== 'function') {
      console.error('Join-to-Create prompt failed: channel is not text-capable.');
      return;
    }

    if (lfgEnabled && !lfgChannelId) {
      console.error('Join-to-Create prompt failed: no LFG channel configured.');
      return;
    }

    await withPromptLock(channel.id, async () => {
      const payload = buildJoinToCreatePromptPayload({
        channelId: channel.id,
        createdTimestamp: Math.floor((channel.createdTimestamp ?? Date.now()) / 1000),
        isLocked: isVoiceChannelLocked(channel, channel.guild),
        lfgEnabled,
        lfgChannelId,
        memberCount: channel.members?.size ?? 0,
        ownerId: member.id,
        userLimit: channel.userLimit ?? 0,
        voiceActivity: await getVoiceActivitySnapshot(channel),
        refreshedAtTimestamp: Math.floor(Date.now() / 1000),
      });

      const existingMessageId = tempPromptMessageIds.get(channel.id) || null;
      if (existingMessageId) {
        const existingMessage = await channel.messages.fetch(existingMessageId).catch(() => null);
        if (existingMessage && isPromptMessageForChannel(existingMessage, channel.id)) {
          const { flags: _ignoredFlags, ...editPayload } = payload;
          const edited = await existingMessage
            .edit({ ...editPayload, allowedMentions: { parse: [] } })
            .then(() => true)
            .catch(async (error) => {
              logPromptRefreshIssue({
                guildId: channel.guild?.id,
                channelId: channel.id,
                messageId: existingMessage.id,
              }, error);
              if (describePromptError(error).expected) {
                await clearPromptMessageId(channel.id);
              }
              return false;
            });
          if (edited) {
            await rememberPromptMessageId(channel.id, existingMessage.id);
            await refreshPersistentLfgForGuild(channel.guild?.id);
            return;
          }
        }
      }

      try {
        const sent = await channel.send({
          ...payload,
          allowedMentions: { users: [member.id] },
        });
        await rememberPromptMessageId(channel.id, sent.id);
        await refreshPersistentLfgForGuild(channel.guild?.id);
      } catch (error) {
        logPromptSendIssue('Join-to-Create prompt send skipped:', {
          guildId: channel.guild?.id,
          channelId: channel.id,
          ownerId: member.id,
        }, error);
      }
    });
  }

  async function editLfgDisbandedMessage(info) {
    if (!info?.lfgChannelId || !info?.lfgMessageId) {
      return;
    }

    if (!info?.ownerId) {
      return;
    }

    const channel = await client.channels
      .fetch(info.lfgChannelId)
      .catch(() => null);
    if (!channel || !channel.isTextBased()) {
      console.error('Failed to edit LFG message: channel not accessible.');
      return;
    }

    const message = await channel.messages
      .fetch(info.lfgMessageId)
      .catch(() => null);
    if (!message) {
      console.error('Failed to edit LFG message: message not found.');
      return;
    }

    try {
      await message.edit({
        content: `Squad <@${info.ownerId}> sudah bubar`,
        allowedMentions: { users: [info.ownerId] },
      });

      setTimeout(() => {
        message.delete().catch((error) => {
          if (error?.code === 10008) return;
          console.error('Failed to delete disbanded LFG message:', error);
        });
      }, 3 * 60 * 1000);
    } catch (error) {
      console.error('Failed to edit LFG message:', error);
    }
  }

  async function runPromptReconcileOnce() {
    if (promptReconcileRunning) return;
    promptReconcileRunning = true;

    try {
      for (const guild of client.guilds.cache.values()) {
        const rows = await configStore.getTempChannelsForGuild(guild.id).catch(() => []);
        for (const row of rows) {
          await refreshJoinToCreatePrompt(guild, row.channel_id).catch((error) => {
            console.error('Failed JTC prompt reconcile for channel:', row.channel_id, error);
          });
        }
      }
    } finally {
      promptReconcileRunning = false;
    }
  }

  function startPromptReconcileLoop() {
    if (promptReconcileInterval) return;

    runPromptReconcileOnce().catch((error) => {
      console.error('Failed to run initial JTC prompt reconcile:', error);
    });

    promptReconcileInterval = setInterval(() => {
      runPromptReconcileOnce().catch((error) => {
        console.error('Failed to run scheduled JTC prompt reconcile:', error);
      });
    }, JTC_PROMPT_RECONCILE_INTERVAL_MS);
  }

  function stopPromptReconcileLoop() {
    if (!promptReconcileInterval) return;
    clearInterval(promptReconcileInterval);
    promptReconcileInterval = null;
  }

  async function handleInteraction(interaction) {
    if (interaction.isButton()) {
      await handleButtonInteraction(interaction, sharedDeps);
      return;
    }

    if (interaction.isAnySelectMenu()) {
      await handleSelectInteraction(interaction, sharedDeps);
      return;
    }

    if (interaction.isModalSubmit()) {
      await handleModalInteraction(interaction, sharedDeps);
    }
  }

  return {
    editLfgDisbandedMessage,
    ensurePersistentLfgMessage: persistentManager.ensurePersistentLfgMessage,
    handleInteraction,
    refreshJoinToCreatePrompt,
    sendJoinToCreatePrompt,
    startPersistentLoop: persistentManager.startPersistentLoop,
    startPromptReconcileLoop,
    stopPersistentLoop: persistentManager.stopPersistentLoop,
    stopPromptReconcileLoop,
  };
}

module.exports = { createLfgManager };
