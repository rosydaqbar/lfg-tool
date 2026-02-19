const {
  buildChannelNameModal,
  buildChannelSizeModal,
  buildChannelSizeRetryRow,
  buildClaimApprovalRow,
  buildLfgModal,
  buildLfgPromptRows,
  buildRegionSelectRow,
  buildTransferSelectRow,
  buildVoiceSettingsRows,
} = require('./builders');
const { createCooldownTracker } = require('./cooldown');
const { createVoiceContextHelpers } = require('./context');
const { handleButtonInteraction } = require('./handlers/button');
const { handleModalInteraction } = require('./handlers/modal');
const { handleSelectInteraction } = require('./handlers/select');
const { createPersistentLfgManager } = require('./persistent');

function createLfgManager({ client, getLogChannel, configStore, env }) {
  const cooldownTracker = createCooldownTracker();
  const voiceContextHelpers = createVoiceContextHelpers(configStore);
  const persistentManager = createPersistentLfgManager({
    client,
    configStore,
    env,
  });

  const sharedDeps = {
    ...cooldownTracker,
    ...voiceContextHelpers,
    buildChannelNameModal,
    buildChannelSizeModal,
    buildChannelSizeRetryRow,
    buildClaimApprovalRow,
    buildLfgModal,
    buildRegionSelectRow,
    buildTransferSelectRow,
    buildVoiceSettingsRows,
    client,
    configStore,
    env,
    getLogChannel,
  };

  async function sendJoinToCreatePrompt(channel, member, lfgChannelId) {
    if (!channel || typeof channel.send !== 'function') {
      console.error('Join-to-Create prompt failed: channel is not text-capable.');
      return;
    }

    if (!lfgChannelId) {
      console.error('Join-to-Create prompt failed: no LFG channel configured.');
      return;
    }

    const content = `Hi <@${member.id}>, Channel sudah di buat, apakah Anda ingin mengirimkan pesan mencari squad di: <#${lfgChannelId}>?`;
    try {
      await channel.send({
        content,
        allowedMentions: { users: [member.id] },
        components: buildLfgPromptRows(channel.id),
      });
    } catch (error) {
      console.error('Failed to send Join-to-Create prompt:', error);
    }
  }

  async function editLfgDisbandedMessage(info) {
    if (!info?.lfgChannelId || !info?.lfgMessageId) {
      console.error('Missing LFG message info for disband edit.');
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
  };
}

module.exports = { createLfgManager };
