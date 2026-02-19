const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} = require('discord.js');
const { LabelBuilder } = require('@discordjs/builders');

const LFG_SEND_PREFIX = 'jtc_send';
const LFG_SETTINGS_PREFIX = 'jtc_settings';
const LFG_MODAL_PREFIX = 'jtc_modal';
const LFG_MESSAGE_INPUT_ID = 'lfg_custom_message';
const CHANNEL_NAME_PREFIX = 'jtc_name';
const CHANNEL_NAME_MODAL_PREFIX = 'jtc_name_modal';
const CHANNEL_NAME_INPUT_ID = 'channel_name';
const CHANNEL_SIZE_PREFIX = 'jtc_size';
const CHANNEL_SIZE_MODAL_PREFIX = 'jtc_size_modal';
const CHANNEL_SIZE_INPUT_ID = 'channel_size';
const CHANNEL_SIZE_RETRY_PREFIX = 'jtc_size_retry';
const CHANNEL_LOCK_PREFIX = 'jtc_lock';
const CHANNEL_UNLOCK_PREFIX = 'jtc_unlock';
const TRANSFER_PREFIX = 'jtc_transfer';
const TRANSFER_MODAL_PREFIX = 'jtc_transfer_modal';
const TRANSFER_USER_INPUT_ID = 'transfer_user';
const CLAIM_PREFIX = 'jtc_claim';
const CLAIM_APPROVE_PREFIX = 'jtc_claim_yes';
const CLAIM_DECLINE_PREFIX = 'jtc_claim_no';
const REGION_PREFIX = 'jtc_region';
const REGION_MODAL_PREFIX = 'jtc_region_modal';
const REGION_SELECT_INPUT_ID = 'region_choice';
const LFG_COOLDOWN_MS = 10 * 60 * 1000;
const PERSISTENT_LFG_INTERVAL_MS = 60 * 1000;

function createLfgManager({ client, getLogChannel, configStore, env }) {
  const lfgCooldowns = new Map();
  const persistentLfgRunning = new Set();
  let persistentInterval = null;

  function buildLfgPromptRows(channelId) {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${LFG_SEND_PREFIX}:${channelId}`)
          .setLabel('Send LFG Post')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`${LFG_SETTINGS_PREFIX}:${channelId}`)
          .setLabel('Voice Settings')
          .setStyle(ButtonStyle.Secondary)
      ),
    ];
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

  function buildVoiceSettingsRows(channelId) {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${CHANNEL_NAME_PREFIX}:${channelId}`)
          .setLabel('Channel Name')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`${CHANNEL_SIZE_PREFIX}:${channelId}`)
          .setLabel('Channel Size')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`${CHANNEL_LOCK_PREFIX}:${channelId}`)
          .setLabel('Lock')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`${CHANNEL_UNLOCK_PREFIX}:${channelId}`)
          .setLabel('Unlock')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`${TRANSFER_PREFIX}:${channelId}`)
          .setLabel('Transfer Ownership')
          .setStyle(ButtonStyle.Primary)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${CLAIM_PREFIX}:${channelId}`)
          .setLabel('Claim Voice Channel')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`${REGION_PREFIX}:${channelId}`)
          .setLabel('Region')
          .setStyle(ButtonStyle.Secondary)
      ),
    ];
  }

  function buildChannelNameModal(channelId, currentName) {
    const input = new TextInputBuilder()
      .setCustomId(CHANNEL_NAME_INPUT_ID)
      .setLabel('Nama channel baru')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(100)
      .setValue((currentName || '').slice(0, 100));

    return new ModalBuilder()
      .setCustomId(`${CHANNEL_NAME_MODAL_PREFIX}:${channelId}`)
      .setTitle('Change Channel Name')
      .addComponents(new ActionRowBuilder().addComponents(input));
  }

  function buildChannelSizeModal(channelId, currentLimit) {
    const initial = String(currentLimit ?? 0);
    const input = new TextInputBuilder()
      .setCustomId(CHANNEL_SIZE_INPUT_ID)
      .setLabel('Batas member (0 = unlimited)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(2)
      .setValue(initial);

    return new ModalBuilder()
      .setCustomId(`${CHANNEL_SIZE_MODAL_PREFIX}:${channelId}`)
      .setTitle('Change Channel Size')
      .addComponents(new ActionRowBuilder().addComponents(input));
  }

  function buildChannelSizeRetryRow(channelId) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${CHANNEL_SIZE_RETRY_PREFIX}:${channelId}`)
        .setLabel('Coba lagi')
        .setStyle(ButtonStyle.Primary)
    );
  }

  function buildTransferModal(channelId) {
    const userSelect = new UserSelectMenuBuilder()
      .setCustomId(TRANSFER_USER_INPUT_ID)
      .setPlaceholder('Pilih member di voice channel')
      .setMinValues(1)
      .setMaxValues(1)
      .setRequired(true);

    const label = new LabelBuilder()
      .setLabel('Transfer Ownership')
      .setDescription('Hanya member yang sedang ada di voice channel yang valid.')
      .setUserSelectMenuComponent(userSelect);

    return new ModalBuilder()
      .setCustomId(`${TRANSFER_MODAL_PREFIX}:${channelId}`)
      .setTitle('Transfer Ownership')
      .addLabelComponents(label);
  }

  function buildRegionModal(channelId, regions, currentRegion) {
    const options = [
      {
        label: 'Automatic',
        value: 'auto',
        description: 'Discord memilih region otomatis',
        default: !currentRegion,
      },
      ...regions.slice(0, 24).map((region) => ({
        label: region.name.slice(0, 100),
        value: region.id,
        description: `Region ID: ${region.id}`.slice(0, 100),
        default: region.id === currentRegion,
      })),
    ];

    const regionSelect = new StringSelectMenuBuilder()
      .setCustomId(REGION_SELECT_INPUT_ID)
      .setPlaceholder('Pilih region voice')
      .setMinValues(1)
      .setMaxValues(1)
      .setRequired(true)
      .addOptions(options);

    const label = new LabelBuilder()
      .setLabel('Region Settings')
      .setDescription('Pilih region native Discord untuk voice channel ini.')
      .setStringSelectMenuComponent(regionSelect);

    return new ModalBuilder()
      .setCustomId(`${REGION_MODAL_PREFIX}:${channelId}`)
      .setTitle('Change Voice Region')
      .addLabelComponents(label);
  }

  function buildClaimApprovalRow(channelId, claimerId) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${CLAIM_APPROVE_PREFIX}:${channelId}:${claimerId}`)
        .setLabel('Ya')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${CLAIM_DECLINE_PREFIX}:${channelId}:${claimerId}`)
        .setLabel('Tidak')
        .setStyle(ButtonStyle.Danger)
    );
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

  async function getTempVoiceContext(guild, channelId) {
    const tempInfo = await configStore.getTempChannelInfo(channelId);
    if (!tempInfo?.ownerId) {
      return { error: 'Channel squad sudah tidak aktif.' };
    }

    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isVoiceBased()) {
      return { error: 'Voice channel tidak ditemukan.' };
    }

    return { tempInfo, channel };
  }

  function isOwner(tempInfo, userId) {
    return tempInfo?.ownerId && tempInfo.ownerId === userId;
  }

  async function transferChannelOwner(channelId, newOwnerId) {
    await configStore.updateTempChannelOwner(channelId, newOwnerId);
  }

  async function userIsInVoiceChannel(channel, userId) {
    return channel.members.has(userId);
  }

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

  async function buildPersistentLfgEmbed(guildId) {
    const tempChannels = await configStore.getTempChannelsForGuild(guildId);
    const items = await Promise.all(
      tempChannels.map(async (row) => {
        const channel = await client.channels.fetch(row.channel_id).catch(() => null);
        if (!channel || !channel.isVoiceBased()) {
          return null;
        }
        const userLimit = channel.userLimit ?? 0;
        const availableCount = Math.max(userLimit - channel.members.size, 0);
        let availabilityLabel = '\u221e';
        if (userLimit > 0) {
          availabilityLabel = availableCount === 0
            ? 'Full'
            : `${availableCount}/${userLimit}`;
        }
        return {
          channelId: channel.id,
          availabilityLabel,
        };
      })
    );

    const doubleTick = '``';

    const availableLines = items
      .filter(Boolean)
      .map((item) => `- <#${item.channelId}> ${doubleTick}${item.availabilityLabel}${doubleTick}`);

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
      const [prefix, channelId, arg1] = interaction.customId.split(':');
      if (!prefix || !channelId) return;

      const guildId = interaction.guildId;
      if (!guildId || !interaction.guild) {
        await interaction.reply({
          content: 'This action can only be used in a server.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (prefix === LFG_SEND_PREFIX) {
        const tempInfo = await configStore.getTempChannelInfo(channelId);
        if (!tempInfo?.ownerId) {
          await interaction.reply({
            content: 'Channel squad sudah tidak aktif.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        if (!isOwner(tempInfo, interaction.user.id)) {
          await interaction.reply({
            content: 'Hanya pemilik Voice yang bisa mengirim pesan LFG',
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
        return;
      }

      if (prefix === LFG_SETTINGS_PREFIX) {
        const context = await getTempVoiceContext(interaction.guild, channelId);
        if (context.error) {
          await interaction.reply({
            content: context.error,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        await interaction.reply({
          content:
            `Pengaturan voice channel <#${channelId}>. ` +
            'Hanya owner yang bisa mengubah setting (kecuali Claim).',
          components: buildVoiceSettingsRows(channelId),
          allowedMentions: { parse: [] },
        });
        return;
      }

      if (
        prefix === CLAIM_APPROVE_PREFIX ||
        prefix === CLAIM_DECLINE_PREFIX
      ) {
        const claimerId = arg1;
        const context = await getTempVoiceContext(interaction.guild, channelId);
        if (context.error || !claimerId) {
          await interaction.reply({
            content: context.error || 'Permintaan claim tidak valid.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (!isOwner(context.tempInfo, interaction.user.id)) {
          await interaction.reply({
            content: 'Hanya owner saat ini yang bisa merespon claim.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (prefix === CLAIM_DECLINE_PREFIX) {
          await interaction.update({
            content:
              `Hi <@${context.tempInfo.ownerId}> user <@${claimerId}> ingin mengambil ownership dari voice channel. ` +
              'Permintaan ditolak.',
            components: [],
            allowedMentions: {
              users: [context.tempInfo.ownerId, claimerId],
            },
          });
          return;
        }

        if (!(await userIsInVoiceChannel(context.channel, claimerId))) {
          await interaction.update({
            content:
              `Hi <@${context.tempInfo.ownerId}> user <@${claimerId}> ingin mengambil ownership dari voice channel. ` +
              'Transfer dibatalkan karena user tidak ada di voice channel.',
            components: [],
            allowedMentions: {
              users: [context.tempInfo.ownerId, claimerId],
            },
          });
          return;
        }

        await transferChannelOwner(channelId, claimerId);
        await interaction.update({
          content: `Ownership voice channel dipindahkan ke <@${claimerId}>.`,
          components: [],
          allowedMentions: { users: [claimerId] },
        });
        return;
      }

      if (prefix === CLAIM_PREFIX) {
        const context = await getTempVoiceContext(interaction.guild, channelId);
        if (context.error) {
          await interaction.reply({
            content: context.error,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (isOwner(context.tempInfo, interaction.user.id)) {
          await interaction.reply({
            content: 'Kamu pemilik channel ini.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (!(await userIsInVoiceChannel(context.channel, interaction.user.id))) {
          await interaction.reply({
            content: 'Kamu harus berada di voice channel ini untuk claim ownership.',
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const ownerPresent = await userIsInVoiceChannel(
          context.channel,
          context.tempInfo.ownerId
        );

        if (!ownerPresent) {
          await transferChannelOwner(channelId, interaction.user.id);
          await interaction.reply({
            content: `Owner tidak berada di channel. Ownership otomatis dipindahkan ke <@${interaction.user.id}>.`,
            allowedMentions: { users: [interaction.user.id] },
          });
          return;
        }

        const prompt =
          `Hi <@${context.tempInfo.ownerId}> user <@${interaction.user.id}> ingin mengambil ownership dari voice channel. ` +
          'Transfer kepemilikan channel?';

        await interaction.reply({
          content: 'Permintaan claim dikirim ke owner saat ini.',
          flags: MessageFlags.Ephemeral,
        });

        await interaction.channel.send({
          content: prompt,
          components: [
            buildClaimApprovalRow(channelId, interaction.user.id),
          ],
          allowedMentions: {
            users: [context.tempInfo.ownerId, interaction.user.id],
          },
        });
        return;
      }

      const ownerActionPrefixes = new Set([
        CHANNEL_NAME_PREFIX,
        CHANNEL_SIZE_PREFIX,
        CHANNEL_SIZE_RETRY_PREFIX,
        CHANNEL_LOCK_PREFIX,
        CHANNEL_UNLOCK_PREFIX,
        TRANSFER_PREFIX,
        REGION_PREFIX,
      ]);

      if (!ownerActionPrefixes.has(prefix)) {
        return;
      }

      const context = await getTempVoiceContext(interaction.guild, channelId);
      if (context.error) {
        await interaction.reply({
          content: context.error,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (!isOwner(context.tempInfo, interaction.user.id)) {
        await interaction.reply({
          content: 'Hanya owner voice channel yang bisa mengubah setting ini.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (prefix === CHANNEL_NAME_PREFIX) {
        await interaction.showModal(
          buildChannelNameModal(channelId, context.channel.name)
        );
        return;
      }

      if (prefix === CHANNEL_SIZE_PREFIX || prefix === CHANNEL_SIZE_RETRY_PREFIX) {
        await interaction.showModal(
          buildChannelSizeModal(channelId, context.channel.userLimit ?? 0)
        );
        return;
      }

      if (prefix === TRANSFER_PREFIX) {
        await interaction.showModal(buildTransferModal(channelId));
        return;
      }

      if (prefix === REGION_PREFIX) {
        const fetched = await interaction.guild.fetchVoiceRegions();
        const regions = [...fetched.values()].sort((a, b) =>
          a.name.localeCompare(b.name)
        );
        await interaction.showModal(
          buildRegionModal(channelId, regions, context.channel.rtcRegion)
        );
        return;
      }

      const overwritePayload =
        prefix === CHANNEL_LOCK_PREFIX
          ? { Connect: false }
          : { Connect: null };

      await context.channel.permissionOverwrites.edit(
        interaction.guildId,
        overwritePayload,
        {
          reason:
            prefix === CHANNEL_LOCK_PREFIX
              ? `Locked by ${interaction.user.id}`
              : `Unlocked by ${interaction.user.id}`,
        }
      );

      await interaction.reply({
        content:
          prefix === CHANNEL_LOCK_PREFIX
            ? 'Voice channel berhasil dikunci.'
            : 'Voice channel berhasil dibuka.',
      });
      return;
    }

    if (interaction.isModalSubmit()) {
      const [prefix, channelId] = interaction.customId.split(':');
      if (!channelId) return;

      const guildId = interaction.guildId;
      if (!guildId || !interaction.guild) {
        await interaction.reply({
          content: 'This action can only be used in a server.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (prefix === CHANNEL_NAME_MODAL_PREFIX) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const context = await getTempVoiceContext(interaction.guild, channelId);
        if (context.error) {
          await interaction.editReply({ content: context.error });
          return;
        }
        if (!isOwner(context.tempInfo, interaction.user.id)) {
          await interaction.editReply({
            content: 'Hanya owner voice channel yang bisa mengubah setting ini.',
          });
          return;
        }

        const newName = interaction.fields
          .getTextInputValue(CHANNEL_NAME_INPUT_ID)
          .trim();
        if (!newName) {
          await interaction.editReply({ content: 'Nama channel tidak boleh kosong.' });
          return;
        }

        await context.channel.setName(newName, `Renamed by ${interaction.user.id}`);
        await interaction.editReply({
          content: `Nama channel berhasil diubah menjadi **${newName}**.`,
        });
        return;
      }

      if (prefix === CHANNEL_SIZE_MODAL_PREFIX) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const context = await getTempVoiceContext(interaction.guild, channelId);
        if (context.error) {
          await interaction.editReply({ content: context.error });
          return;
        }
        if (!isOwner(context.tempInfo, interaction.user.id)) {
          await interaction.editReply({
            content: 'Hanya owner voice channel yang bisa mengubah setting ini.',
          });
          return;
        }

        const rawLimit = interaction.fields
          .getTextInputValue(CHANNEL_SIZE_INPUT_ID)
          .trim();
        if (!/^\d+$/.test(rawLimit)) {
          await interaction.editReply({
            content: 'Input harus berupa angka. Silakan coba lagi.',
            components: [buildChannelSizeRetryRow(channelId)],
          });
          return;
        }

        const limit = Number.parseInt(rawLimit, 10);
        if (limit < 0 || limit > 99) {
          await interaction.editReply({
            content: 'Batas member harus di antara 0 sampai 99.',
            components: [buildChannelSizeRetryRow(channelId)],
          });
          return;
        }

        await context.channel.setUserLimit(limit, `User limit set by ${interaction.user.id}`);
        await interaction.editReply({
          content:
            limit === 0
              ? 'Batas member diubah ke unlimited.'
              : `Batas member diubah ke ${limit}.`,
          components: [],
        });
        return;
      }

      if (prefix === TRANSFER_MODAL_PREFIX) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const context = await getTempVoiceContext(interaction.guild, channelId);
        if (context.error) {
          await interaction.editReply({ content: context.error });
          return;
        }
        if (!isOwner(context.tempInfo, interaction.user.id)) {
          await interaction.editReply({
            content: 'Hanya owner voice channel yang bisa mengubah setting ini.',
          });
          return;
        }

        const selectedUsers = interaction.fields.getSelectedUsers(
          TRANSFER_USER_INPUT_ID,
          true
        );
        const newOwnerId = selectedUsers.firstKey();
        if (!newOwnerId) {
          await interaction.editReply({
            content: 'User transfer tidak valid.',
          });
          return;
        }
        if (newOwnerId === context.tempInfo.ownerId) {
          await interaction.editReply({
            content: 'User tersebut sudah menjadi owner channel ini.',
          });
          return;
        }

        if (!(await userIsInVoiceChannel(context.channel, newOwnerId))) {
          await interaction.editReply({
            content: 'User harus berada di voice channel ini.',
          });
          return;
        }

        await transferChannelOwner(channelId, newOwnerId);
        await interaction.editReply({
          content: `Ownership berhasil dipindahkan ke <@${newOwnerId}>.`,
          allowedMentions: { users: [newOwnerId] },
        });
        return;
      }

      if (prefix === REGION_MODAL_PREFIX) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const context = await getTempVoiceContext(interaction.guild, channelId);
        if (context.error) {
          await interaction.editReply({ content: context.error });
          return;
        }
        if (!isOwner(context.tempInfo, interaction.user.id)) {
          await interaction.editReply({
            content: 'Hanya owner voice channel yang bisa mengubah setting ini.',
          });
          return;
        }

        const selected = interaction.fields.getStringSelectValues(
          REGION_SELECT_INPUT_ID
        );
        const choice = selected[0];
        if (!choice) {
          await interaction.editReply({ content: 'Region tidak valid.' });
          return;
        }

        let rtcRegion = null;
        if (choice !== 'auto') {
          const fetched = await interaction.guild.fetchVoiceRegions();
          if (!fetched.has(choice)) {
            await interaction.editReply({ content: 'Region tidak tersedia.' });
            return;
          }
          rtcRegion = choice;
        }

        await context.channel.setRTCRegion(
          rtcRegion,
          `Region updated by ${interaction.user.id}`
        );
        await interaction.editReply({
          content:
            rtcRegion === null
              ? 'Region voice channel diubah ke Automatic.'
              : `Region voice channel diubah ke **${rtcRegion}**.`,
        });
        return;
      }

      if (prefix !== LFG_MODAL_PREFIX) return;

      const remaining = getCooldownRemainingMs(guildId, interaction.user.id);
      try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      } catch (error) {
        console.error('Failed to defer LFG modal reply:', error);
        return;
      }

      const tempInfo = await configStore.getTempChannelInfo(channelId);
      if (!tempInfo?.ownerId) {
        await interaction.editReply({
          content: 'Channel squad sudah tidak aktif.',
        });
        return;
      }
      if (interaction.user.id !== tempInfo.ownerId) {
        await interaction.editReply({
          content: 'Hanya pemilik Voice yang bisa mengirim pesan LFG',
        });
        return;
      }

      if (remaining > 0) {
        await interaction.editReply({
          content: `Please wait ${formatCooldown(remaining)} before sending another LFG post.`,
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
        await interaction.editReply({
          content: 'No log channel is configured.',
        });
        return;
      }

      const logChannel = await getLogChannel(logChannelId);
      if (!logChannel) {
        await interaction.editReply({
          content: 'Unable to access the log channel.',
        });
        return;
      }

      try {
        const rawCustomMessage = interaction.fields.getTextInputValue(
          LFG_MESSAGE_INPUT_ID
        );
        const customMessage = rawCustomMessage.trim();
        const roleId = tempInfo?.roleId ?? null;
        if (!roleId) {
          await interaction.editReply({
            content:
              'Role LFG untuk lobby ini belum dikonfigurasi. Hubungi admin.',
          });
          return;
        }
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
          : [];
        const lines = [
          `-# <@&${roleId}>`,
          `<@${interaction.user.id}> sedang mencari squad, join: ${voiceLink}`,
          '',
        ];
        if (quoteLines.length > 0) {
          lines.push('-# Pesan:', ...quoteLines, '');
        }
        lines.push(`-# Dibuat pada: <t:${createdTimestamp}:f>`);
        lines.push(`-# Info lebih lanjut: <@${interaction.user.id}>`);

        const lfgMessage = await logChannel.send({
          content: lines.join('\n'),
          allowedMentions: { roles: [roleId], users: [interaction.user.id] },
        });
        await configStore.updateTempChannelMessage(
          channelId,
          logChannelId,
          lfgMessage.id
        );
        setCooldown(guildId, interaction.user.id);
        await interaction.editReply({
          content: 'LFG post sent.',
        });
      } catch (error) {
        console.error('Failed to send LFG post:', error);
        await interaction
          .editReply({
            content: 'Failed to send the LFG post.',
          })
          .catch((replyError) => {
            console.error('Failed to reply to LFG modal:', replyError);
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
