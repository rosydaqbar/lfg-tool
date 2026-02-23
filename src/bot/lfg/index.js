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

function createLfgManager({ client, getLogChannel, configStore, env }) {
  const tempPromptMessageIds = new Map();
  const cooldownTracker = createCooldownTracker();
  const voiceContextHelpers = createVoiceContextHelpers(configStore);
  const persistentManager = createPersistentLfgManager({
    client,
    configStore,
    env,
  });

  function setPromptMessageId(channelId, messageId) {
    if (!channelId || !messageId) return;
    tempPromptMessageIds.set(channelId, messageId);
  }

  function isVoiceChannelLocked(channel, guild) {
    const everyoneId = guild?.roles?.everyone?.id;
    if (!everyoneId) return false;
    const overwrite = channel.permissionOverwrites.cache.get(everyoneId);
    if (!overwrite) return false;
    return overwrite.deny.has('Connect');
  }

  async function findPromptMessage(channel) {
    if (!channel || typeof channel.messages?.fetch !== 'function') return null;
    const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
    if (!recent) return null;

    return (
      recent.find((msg) =>
        msg.author?.id === client.user?.id
        && msg.components.some((component) => {
          if (!Array.isArray(component.components)) return false;
          return component.components.some(
            (child) => child.customId?.startsWith('jtc_')
          );
        })
      ) || null
    );
  }

  async function refreshJoinToCreatePrompt(guild, channelId) {
    if (!guild || !channelId) return;

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
    });

    let message = null;
    const knownMessageId = tempPromptMessageIds.get(channelId);
    if (knownMessageId) {
      message = await channel.messages.fetch(knownMessageId).catch(() => null);
    }
    if (!message) {
      message = await findPromptMessage(channel);
    }
    if (!message) return;

    await message
      .edit({
        ...payload,
        allowedMentions: { users: [tempInfo.ownerId] },
      })
      .catch(() => null);

    setPromptMessageId(channelId, message.id);
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

    const payload = buildJoinToCreatePromptPayload({
      channelId: channel.id,
      createdTimestamp: Math.floor((channel.createdTimestamp ?? Date.now()) / 1000),
      isLocked: isVoiceChannelLocked(channel, channel.guild),
      lfgEnabled,
      lfgChannelId,
      memberCount: channel.members?.size ?? 0,
      ownerId: member.id,
      userLimit: channel.userLimit ?? 0,
    });

    try {
      const sent = await channel.send({
        ...payload,
        allowedMentions: { users: [member.id] },
      });
      setPromptMessageId(channel.id, sent.id);
    } catch (error) {
      console.error('Failed to send Join-to-Create prompt:', error);
    }
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
    sendJoinToCreatePrompt,
    startPersistentLoop: persistentManager.startPersistentLoop,
    stopPersistentLoop: persistentManager.stopPersistentLoop,
  };
}

module.exports = { createLfgManager };
