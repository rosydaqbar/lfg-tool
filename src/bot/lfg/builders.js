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
  LFG_REMINDER_MODAL_PREFIX,
  LFG_REMINDER_SEND_PREFIX,
  LFG_SEND_PREFIX,
  LEADERBOARD_PREFIX,
  MY_STATS_PREFIX,
  REGION_PREFIX,
  REGION_SELECT_PREFIX,
  TRANSFER_PREFIX,
  TRANSFER_SELECT_PREFIX,
} = require('./constants');
const { t } = require('../../i18n');

function buildLfgPromptRows(channelId, locale = 'en') {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${LFG_SEND_PREFIX}:${channelId}`)
        .setLabel(t(locale, 'lfg.sendPost'))
        .setStyle(ButtonStyle.Primary)
    ),
  ];
}

function buildLfgModal(channelId, locale = 'en') {
  const modal = new ModalBuilder()
    .setCustomId(`${LFG_MODAL_PREFIX}:${channelId}`)
    .setTitle(t(locale, 'lfg.postModalTitle'));

  const messageInput = new TextInputBuilder()
    .setCustomId(LFG_MESSAGE_INPUT_ID)
    .setLabel(t(locale, 'lfg.messageLabel'))
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(700);

  modal.addComponents(
    new ActionRowBuilder().addComponents(messageInput)
  );

  return modal;
}

function buildVoiceSettingsRows(channelId, locale = 'en') {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${CHANNEL_NAME_PREFIX}:${channelId}`)
        .setEmoji('✏️')
        .setLabel(t(locale, 'lfg.channelName'))
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${CHANNEL_SIZE_PREFIX}:${channelId}`)
        .setEmoji('👥')
        .setLabel(t(locale, 'lfg.channelSize'))
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${CHANNEL_LOCK_PREFIX}:${channelId}`)
        .setEmoji('🔒')
        .setLabel(t(locale, 'lfg.lock'))
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${CHANNEL_UNLOCK_PREFIX}:${channelId}`)
        .setEmoji('🔓')
        .setLabel(t(locale, 'lfg.unlock'))
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${TRANSFER_PREFIX}:${channelId}`)
        .setEmoji('🔁')
        .setLabel(t(locale, 'lfg.transferOwnership'))
        .setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${CLAIM_PREFIX}:${channelId}`)
        .setEmoji('👑')
        .setLabel(t(locale, 'lfg.claimVoice'))
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${REGION_PREFIX}:${channelId}`)
        .setEmoji('🌍')
        .setLabel(t(locale, 'lfg.region'))
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}

function formatDuration(totalMs, locale = 'en') {
  const safeMs = Math.max(0, Number(totalMs) || 0);
  const totalMinutes = Math.floor(safeMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return t(locale, 'common.durationMinutes', { minutes });
  return t(locale, 'common.durationHoursMinutes', { hours, minutes });
}

function buildVoiceActivityContainer(channelId, activity, refreshedAtTimestamp, locale = 'en') {
  const active = (activity?.active || []).slice(0, 10);
  const history = (activity?.history || []).slice(0, 10);

  const activeLines = active.length
    ? active.map(
      (row) => `- <@${row.userId}> • ${t(locale, 'lfg.joined')}: ${row.joinedAt ? `<t:${Math.floor(row.joinedAt.getTime() / 1000)}:R>` : '-'}`
    )
    : [t(locale, 'lfg.noActiveUsers')];

  const historyLines = history.length
    ? history.map(
      (row) => `- <@${row.userId}> • ${t(locale, 'lfg.total')}: \`${formatDuration(row.totalMs, locale)}\``
    )
    : [t(locale, 'lfg.noHistory')];

  if ((activity?.activeCount || 0) > active.length) {
    activeLines.push(t(locale, 'lfg.andMore', { count: (activity.activeCount || 0) - active.length }));
  }

  if ((activity?.historyCount || 0) > history.length) {
    historyLines.push(t(locale, 'lfg.andMore', { count: (activity.historyCount || 0) - history.length }));
  }

  const body = [
    t(locale, 'lfg.voiceLogTitle'),
    t(locale, 'lfg.voiceLogHelp'),
    '',
    t(locale, 'lfg.currentlyActive'),
    ...activeLines,
    '',
    t(locale, 'lfg.history'),
    ...historyLines,
  ].join('\n');

  return new ContainerBuilder()
    .setAccentColor(0x0ea5e9)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(body))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${MY_STATS_PREFIX}:${channelId}`)
          .setEmoji('📊')
          .setLabel(t(locale, 'lfg.myStats'))
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`${LEADERBOARD_PREFIX}:${channelId}`)
          .setEmoji('🏆')
          .setLabel(t(locale, 'lfg.leaderboard'))
          .setStyle(ButtonStyle.Secondary)
        )
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        t(locale, 'lfg.lastUpdate', { timestamp: `<t:${refreshedAtTimestamp}:F>` })
      )
    );
}

function buildLfgReminderRows(guildId, channelId, locale = 'en') {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${LFG_REMINDER_SEND_PREFIX}:${guildId}:${channelId}`)
        .setLabel(t(locale, 'lfg.sendPost'))
        .setStyle(ButtonStyle.Primary)
    ),
  ];
}

function buildLfgReminderModal(guildId, channelId, locale = 'en') {
  const modal = buildLfgModal(channelId, locale);
  modal.setCustomId(`${LFG_REMINDER_MODAL_PREFIX}:${guildId}:${channelId}`);
  return modal;
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
  voiceActivity = { active: [], history: [], activeCount: 0, historyCount: 0 },
  refreshedAtTimestamp = Math.floor(Date.now() / 1000),
  locale = 'en',
}) {
  const introText = lfgEnabled
    ? t(locale, 'lfg.promptWithLfg', { ownerId, lfgChannelId })
    : t(locale, 'lfg.promptCreated', { ownerId });
  const intro = new TextDisplayBuilder().setContent(introText);

  const topSeparator = new SeparatorBuilder().setDivider(true);

  const detailLines = [
    t(locale, 'lfg.voiceSettingsTitle'),
    t(locale, 'lfg.settingsDescription'),
    '',
    t(locale, 'lfg.voiceChannel', { channelId }),
    t(locale, 'lfg.createdAt', { timestamp: `<t:${createdTimestamp}:F>` }),
    t(locale, 'lfg.currentOwner', { ownerId }),
    t(locale, 'lfg.lockStatus', { status: t(locale, isLocked ? 'lfg.locked' : 'lfg.unlocked') }),
    t(locale, 'lfg.channelSizeLine', { members: memberCount, limit: userLimit > 0 ? userLimit : '∞' }),
  ].join('\n');

  const helpText = new TextDisplayBuilder().setContent(
    t(locale, 'lfg.settingsHelp')
  );

  const container = new ContainerBuilder()
    .setAccentColor(0xff0000)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(detailLines))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(helpText)
    .addActionRowComponents(...buildVoiceSettingsRows(channelId, locale))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        t(locale, 'lfg.addBot')
      )
    );

  return {
    components: [
      intro,
      ...(lfgEnabled ? buildLfgPromptRows(channelId, locale) : []),
      topSeparator,
      container,
      buildVoiceActivityContainer(channelId, voiceActivity, refreshedAtTimestamp, locale),
    ],
    flags: MessageFlags.IsComponentsV2,
  };
}

function buildChannelNameModal(channelId, currentName, locale = 'en') {
  const input = new TextInputBuilder()
    .setCustomId(CHANNEL_NAME_INPUT_ID)
    .setLabel(t(locale, 'lfg.newChannelName'))
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100)
    .setValue((currentName || '').slice(0, 100));

  return new ModalBuilder()
    .setCustomId(`${CHANNEL_NAME_MODAL_PREFIX}:${channelId}`)
    .setTitle(t(locale, 'lfg.changeChannelName'))
    .addComponents(new ActionRowBuilder().addComponents(input));
}

function buildChannelSizeModal(channelId, currentLimit, locale = 'en') {
  const initial = String(currentLimit ?? 0);
  const input = new TextInputBuilder()
    .setCustomId(CHANNEL_SIZE_INPUT_ID)
    .setLabel(t(locale, 'lfg.memberLimit'))
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(2)
    .setValue(initial);

  return new ModalBuilder()
    .setCustomId(`${CHANNEL_SIZE_MODAL_PREFIX}:${channelId}`)
    .setTitle(t(locale, 'lfg.changeChannelSize'))
    .addComponents(new ActionRowBuilder().addComponents(input));
}

function buildChannelSizeRetryRow(channelId, locale = 'en') {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${CHANNEL_SIZE_RETRY_PREFIX}:${channelId}`)
      .setLabel(t(locale, 'common.tryAgain'))
      .setStyle(ButtonStyle.Primary)
  );
}

function buildTransferMemberSelectRow(channelId, members, locale = 'en') {
  const options = members.slice(0, 25).map((member) => ({
    label: member.displayName.slice(0, 100),
    value: member.id,
    description: `@${member.user.username}`.slice(0, 100),
  }));

  const select = new StringSelectMenuBuilder()
    .setCustomId(`${TRANSFER_SELECT_PREFIX}:${channelId}`)
    .setPlaceholder(t(locale, 'lfg.selectTransferPlaceholder'))
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options);

  return new ActionRowBuilder().addComponents(select);
}

function buildRegionSelectRow(channelId, regions, currentRegion, locale = 'en') {
  const options = [
    {
      label: t(locale, 'lfg.automatic'),
      value: 'auto',
      description: t(locale, 'lfg.autoRegionDescription'),
      default: !currentRegion,
    },
    ...regions.slice(0, 24).map((region) => ({
      label: region.name.slice(0, 100),
      value: region.id,
      description: t(locale, 'lfg.regionId', { regionId: region.id }).slice(0, 100),
      default: region.id === currentRegion,
    })),
  ];

  const regionSelect = new StringSelectMenuBuilder()
    .setCustomId(`${REGION_SELECT_PREFIX}:${channelId}`)
    .setPlaceholder(t(locale, 'lfg.selectRegionPlaceholder'))
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options);

  return new ActionRowBuilder().addComponents(regionSelect);
}

function buildClaimApprovalRow(channelId, claimerId, locale = 'en') {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${CLAIM_APPROVE_PREFIX}:${channelId}:${claimerId}`)
      .setLabel(t(locale, 'lfg.yes'))
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${CLAIM_DECLINE_PREFIX}:${channelId}:${claimerId}`)
      .setLabel(t(locale, 'lfg.no'))
      .setStyle(ButtonStyle.Danger)
  );
}

async function buildPersistentLfgEmbed({ client, configStore, guildId, locale = 'en' }) {
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
          ? t(locale, 'lfg.full')
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
    availableLines.push(t(locale, 'lfg.noSquads'));
  }

  const description = [
    t(locale, 'lfg.respect'),
    t(locale, 'lfg.availableSquads'),
    ...availableLines,
  ].join('\n');

  return new EmbedBuilder()
    .setColor(0xff0000)
    .setDescription(description)
    .setFooter({ text: t(locale, 'lfg.squadFooter') });
}

module.exports = {
  buildChannelNameModal,
  buildChannelSizeModal,
  buildChannelSizeRetryRow,
  buildClaimApprovalRow,
  buildLfgModal,
  buildLfgReminderModal,
  buildLfgReminderRows,
  buildLfgPromptRows,
  buildJoinToCreatePromptPayload,
  buildPersistentLfgEmbed,
  buildRegionSelectRow,
  buildTransferMemberSelectRow,
  buildVoiceSettingsRows,
};
