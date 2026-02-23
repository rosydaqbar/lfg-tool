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
} = require('discord.js');
const {
  ContainerBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
} = require('@discordjs/builders');

const {
  CHANNEL_NAME_INPUT_ID,
  CHANNEL_NAME_MODAL_PREFIX,
  CHANNEL_NAME_PREFIX,
  CHANNEL_SIZE_INPUT_ID,
  CHANNEL_SIZE_MODAL_PREFIX,
  CHANNEL_SIZE_PREFIX,
  CHANNEL_SIZE_RETRY_PREFIX,
  CHANNEL_LOCK_PREFIX,
  CHANNEL_UNLOCK_PREFIX,
  CLAIM_APPROVE_PREFIX,
  CLAIM_DECLINE_PREFIX,
  CLAIM_PREFIX,
  LFG_MESSAGE_INPUT_ID,
  LFG_MODAL_PREFIX,
  LFG_SEND_PREFIX,
  REGION_PREFIX,
  REGION_SELECT_PREFIX,
  TRANSFER_PREFIX,
  TRANSFER_SELECT_PREFIX,
} = require('./constants');

function buildLfgPromptRows(channelId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${LFG_SEND_PREFIX}:${channelId}`)
        .setLabel('Send LFG Post')
        .setStyle(ButtonStyle.Primary)
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

  modal.addComponents(
    new ActionRowBuilder().addComponents(messageInput)
  );

  return modal;
}

function buildVoiceSettingsRows(channelId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${CHANNEL_NAME_PREFIX}:${channelId}`)
        .setEmoji('✏️')
        .setLabel('Nama Channel')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${CHANNEL_SIZE_PREFIX}:${channelId}`)
        .setEmoji('👥')
        .setLabel('Ukuran Channel')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${CHANNEL_LOCK_PREFIX}:${channelId}`)
        .setEmoji('🔒')
        .setLabel('Kunci')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${CHANNEL_UNLOCK_PREFIX}:${channelId}`)
        .setEmoji('🔓')
        .setLabel('Buka Kunci')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${TRANSFER_PREFIX}:${channelId}`)
        .setEmoji('🔁')
        .setLabel('Transfer Kepemilikan')
        .setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${CLAIM_PREFIX}:${channelId}`)
        .setEmoji('👑')
        .setLabel('Claim Voice Channel')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${REGION_PREFIX}:${channelId}`)
        .setEmoji('🌍')
        .setLabel('Region')
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}

function buildJoinToCreatePromptPayload({
  channelId,
  createdTimestamp,
  isLocked,
  lfgEnabled = true,
  lfgChannelId,
  memberCount = 0,
  ownerId,
  userLimit = 0,
}) {
  const introText = lfgEnabled
    ? `Hi <@${ownerId}>, Channel sudah di buat, apakah Anda ingin mengirimkan pesan mencari squad di: <#${lfgChannelId}>?`
    : `Hi <@${ownerId}>, Channel sudah dibuat.`;
  const intro = new TextDisplayBuilder().setContent(introText);

  const topSeparator = new SeparatorBuilder().setDivider(true);

  const detailLines = [
    '### Voice Settings',
    'Atur voice channel secara mandiri',
    '',
    `- Voice Channel: <#${channelId}>`,
    `- Dibuat pada: <t:${createdTimestamp}:F>`,
    `- Owner saat ini: <@${ownerId}>`,
    `- Status lock: ${isLocked ? 'Terkunci' : 'Terbuka'}`,
    `- Ukuran Channel: \`${memberCount}/${userLimit > 0 ? userLimit : '∞'}\``,
  ].join('\n');

  const helpText = new TextDisplayBuilder().setContent(
    '-# Tombol di bawah dapat dipakai untuk mengubah nama channel, membatasi jumlah member, lock/unlock, transfer ownership, claim channel, dan mengganti region voice.'
  );

  const container = new ContainerBuilder()
    .setAccentColor(0xff0000)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(detailLines))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(helpText)
    .addActionRowComponents(...buildVoiceSettingsRows(channelId))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '-# Ingin memasukan bot ini ke servermu? Kontak: <@111080662550732800>'
      )
    );

  return {
    components: [
      intro,
      ...(lfgEnabled ? buildLfgPromptRows(channelId) : []),
      topSeparator,
      container,
    ],
    flags: MessageFlags.IsComponentsV2,
  };
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

function buildTransferMemberSelectRow(channelId, members) {
  const options = members.slice(0, 25).map((member) => ({
    label: member.displayName.slice(0, 100),
    value: member.id,
    description: `@${member.user.username}`.slice(0, 100),
  }));

  const select = new StringSelectMenuBuilder()
    .setCustomId(`${TRANSFER_SELECT_PREFIX}:${channelId}`)
    .setPlaceholder('Pilih member di voice channel')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options);

  return new ActionRowBuilder().addComponents(select);
}

function buildRegionSelectRow(channelId, regions, currentRegion) {
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
    .setCustomId(`${REGION_SELECT_PREFIX}:${channelId}`)
    .setPlaceholder('Pilih region voice')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options);

  return new ActionRowBuilder().addComponents(regionSelect);
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

async function buildPersistentLfgEmbed({ client, configStore, guildId }) {
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

module.exports = {
  buildChannelNameModal,
  buildChannelSizeModal,
  buildChannelSizeRetryRow,
  buildClaimApprovalRow,
  buildLfgModal,
  buildLfgPromptRows,
  buildJoinToCreatePromptPayload,
  buildPersistentLfgEmbed,
  buildRegionSelectRow,
  buildTransferMemberSelectRow,
  buildVoiceSettingsRows,
};
