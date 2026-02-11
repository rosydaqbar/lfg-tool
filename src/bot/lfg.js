const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const LFG_ROLE_ID = '1448150505661403181';
const LFG_SEND_PREFIX = 'jtc_send';
const LFG_MODAL_PREFIX = 'jtc_modal';
const LFG_MESSAGE_INPUT_ID = 'lfg_custom_message';
const LFG_COOLDOWN_MS = 10 * 60 * 1000;
const PERSISTENT_LFG_INTERVAL_MS = 60 * 1000;

function createLfgManager({ client, getLogChannel, configStore, env }) {
  const lfgCooldowns = new Map();
  const persistentLfgRunning = new Set();
  let persistentInterval = null;

  function buildLfgPromptRow(channelId) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${LFG_SEND_PREFIX}:${channelId}`)
        .setLabel('Send LFG Post')
        .setStyle(ButtonStyle.Primary)
    );
  }

  function buildLfgModal(channelId) {
    const modal = new ModalBuilder()
      .setCustomId(`${LFG_MODAL_PREFIX}:${channelId}`)
      .setTitle('LFG Post');

    const messageInput = new TextInputBuilder()
      .setCustomId(LFG_MESSAGE_INPUT_ID)
      .setLabel('Pesan (cth: -3 Redsec Battle royale)')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(700);

    const row = new ActionRowBuilder().addComponents(messageInput);
    modal.addComponents(row);

    return modal;
  }

  function getCooldownKey(guildId, userId) {
    return `${guildId}:${userId}`;
  }

  function getCooldownRemainingMs(guildId, userId) {
    const key = getCooldownKey(guildId, userId);
    const lastSent = lfgCooldowns.get(key);
    if (!lastSent) return 0;
    const elapsed = Date.now() - lastSent;
    return elapsed < LFG_COOLDOWN_MS ? LFG_COOLDOWN_MS - elapsed : 0;
  }

  function setCooldown(guildId, userId) {
    const key = getCooldownKey(guildId, userId);
    lfgCooldowns.set(key, Date.now());
  }

  function formatCooldown(ms) {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes <= 0) return `${seconds}s`;
    return `${minutes}m ${seconds}s`;
  }

  function buildPersistentLfgContent(guildId, lobbyIds) {
    if (!lobbyIds.length) return null;
    const links = lobbyIds.map(
      (id) => `https://discordapp.com/channels/${guildId}/${id}`
    );
    return `Untuk mencari teman/squad baru, silahkan buat voice channel terlebih dahulu: ${links.join(' ')}`;
  }

  async function buildPersistentLfgEmbed(guildId) {
    const tempChannels = await configStore.getTempChannelsForGuild(guildId);
    const items = await Promise.all(
      tempChannels.map(async (row) => {
        const channel = await client.channels.fetch(row.channel_id).catch(() => null);
        if (!channel || !channel.isVoiceBased()) {
          return null;
        }
        const userLimit = channel.userLimit ?? 0;
        const available = userLimit > 0
          ? Math.max(userLimit - channel.members.size, 0)
          : '\u221e';
        return {
          channelId: channel.id,
          available,
        };
      })
    );

    const doubleTick = '``';

    const availableLines = items
      .filter(Boolean)
      .map((item) => `- <#${item.channelId}> ${doubleTick}${item.available}${doubleTick}`);

    if (availableLines.length === 0) {
      availableLines.push('*Tidak ada squad yang tersedia*');
    }

    const description = [
      'Tetap saling menghormati antar sesame member.',
      '-# Daftar squad yang tersedia:',
      ...availableLines,
    ].join('\n');

    return new EmbedBuilder()
      .setColor(0xff0000)
      .setDescription(description)
      .setFooter({ text: 'Klik salah satu voice diatas untuk join squad' });
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
      const embed = await buildPersistentLfgEmbed(guildId);

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
        components: [buildLfgPromptRow(channel.id)],
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
      const [prefix, channelId] = interaction.customId.split(':');
      if (!prefix || !channelId) return;

      if (prefix === LFG_SEND_PREFIX) {
        const guildId = interaction.guildId;
        if (!guildId) {
          await interaction.reply({
            content: 'This action can only be used in a server.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const remaining = getCooldownRemainingMs(guildId, interaction.user.id);
        if (remaining > 0) {
          await interaction.reply({
            content: `Please wait ${formatCooldown(remaining)} before sending another LFG post.`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        try {
          await interaction.showModal(buildLfgModal(channelId));
        } catch (error) {
          console.error('Failed to show LFG modal:', error);
          await interaction.reply({
            content: 'Unable to open the LFG form right now.',
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      return;
    }

    if (interaction.isModalSubmit()) {
      const [prefix, channelId] = interaction.customId.split(':');
      if (prefix !== LFG_MODAL_PREFIX || !channelId) return;

      const guildId = interaction.guildId;
      if (!guildId) {
        await interaction.reply({
          content: 'This action can only be used in a server.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const remaining = getCooldownRemainingMs(guildId, interaction.user.id);
      if (remaining > 0) {
        await interaction.reply({
          content: `Please wait ${formatCooldown(remaining)} before sending another LFG post.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

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

      const logChannelId =
        config.lfgChannelId || config.logChannelId || env.LOG_CHANNEL_ID;
      if (!logChannelId) {
        await interaction.reply({
          content: 'No log channel is configured.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const logChannel = await getLogChannel(logChannelId);
      if (!logChannel) {
        await interaction.reply({
          content: 'Unable to access the log channel.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      try {
        const rawCustomMessage = interaction.fields.getTextInputValue(
          LFG_MESSAGE_INPUT_ID
        );
        const customMessage = rawCustomMessage.trim();
        const channel = await interaction.guild.channels
          .fetch(channelId)
          .catch(() => null);
        const createdTimestamp = Math.floor(
          (channel?.createdTimestamp ?? Date.now()) / 1000
        );
        const voiceLink = `https://discordapp.com/channels/${guildId}/${channelId}`;
        const quoteLines = customMessage
          ? customMessage
              .split(/\r?\n/)
              .map((line) => `> ${line}`)
          : ['>'];
        const lines = [
          `-# <@&${LFG_ROLE_ID}>`,
          `<@${interaction.user.id}> mencari squad, join: ${voiceLink}`,
          '',
          '-# Pesan:',
          ...quoteLines,
          '',
        ];
        lines.push(`-# Dibuat pada: <t:${createdTimestamp}:f>`);
        lines.push(`-# Info lebih lanjut: <@${interaction.user.id}>`);

        const lfgMessage = await logChannel.send({
          content: lines.join('\n'),
          allowedMentions: { roles: [LFG_ROLE_ID], users: [interaction.user.id] },
        });
        await configStore.updateTempChannelMessage(
          channelId,
          logChannelId,
          lfgMessage.id
        );
        setCooldown(guildId, interaction.user.id);
        await interaction.reply({
          content: 'LFG post sent.',
          flags: MessageFlags.Ephemeral,
        });
      } catch (error) {
        console.error('Failed to send LFG post:', error);
        await interaction.reply({
          content: 'Failed to send the LFG post.',
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  }

  return {
    handleInteraction,
    sendJoinToCreatePrompt,
    editLfgDisbandedMessage,
    ensurePersistentLfgMessage,
    startPersistentLoop,
  };
}

module.exports = { createLfgManager };
