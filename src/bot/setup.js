const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ContainerBuilder,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SlashCommandBuilder,
  TextDisplayBuilder,
} = require('discord.js');
const {
  createQuickSetupProvisioner,
  getQuickSetupPermissionError,
} = require('./setup-provisioning');
const { getGuildLocale, normalizeLocale, t } = require('../i18n');

const SETUP_COMMAND = 'setup';
const STEP1_CHANGE_PREFIX = 'guild_setup_change';
const STEP1_MODAL_ID = 'guild_setup_channels';
const STEP1_CONTINUE_ID = 'guild_setup_continue';
const STEP1_BACK_ID = 'guild_setup_back_step1';
const STEP2_MANAGE_ID = 'guild_setup_manage_step2';
const SETUP_REFRESH_ID = 'guild_setup_refresh';
const QUICK_SETUP_ID = 'guild_setup_quick';
const QUICK_RECOVER_ID = 'guild_setup_quick_recover';
const QUICK_MODAL_ID = 'guild_setup_quick_category';
const MANUAL_SETUP_PREFIX = 'guild_setup_manual';
const MANUAL_MODAL_ID = 'guild_setup_manual_lobby';
const LOG_CHANNEL_SELECT_ID = 'guild_setup_log_channel';
const LFG_CHANNEL_SELECT_ID = 'guild_setup_lfg_channel';
const CATEGORY_SELECT_ID = 'guild_setup_category';
const LOBBY_CHANNEL_SELECT_ID = 'guild_setup_lobby_channel';
const LOBBY_ROLE_SELECT_ID = 'guild_setup_lobby_role';
const TEXT_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const VOICE_CHANNEL_TYPES = [ChannelType.GuildVoice];
const EXISTING_VOICE_CHANNEL_TYPES = [ChannelType.GuildVoice, ChannelType.GuildStageVoice];
const SETUP_MESSAGE_FLAGS = MessageFlags.Ephemeral | MessageFlags.IsComponentsV2;

function buildSetupCommand() {
  return new SlashCommandBuilder()
    .setName(SETUP_COMMAND)
    .setDescription(t('en', 'setup.commandDescription'))
    .setDescriptionLocalizations({ id: t('id', 'setup.commandDescription') })
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .toJSON();
}

function isAllowedTextChannel(channel, guildId) {
  return Boolean(
    channel
    && channel.guildId === guildId
    && TEXT_CHANNEL_TYPES.includes(channel.type)
  );
}

function isExistingVoiceChannel(channel, guildId) {
  return Boolean(
    channel
    && channel.guildId === guildId
    && EXISTING_VOICE_CHANNEL_TYPES.includes(channel.type)
  );
}

async function resolveConfiguredChannel(guild, channelId, validator) {
  if (!channelId) return null;
  const channel = guild.channels.cache.get(channelId)
    || await guild.channels.fetch(channelId).catch(() => null);
  return validator(channel, guild.id) ? channel : null;
}

function formatConfiguredChannel(channelId, channel, locale = 'en') {
  if (channel) return `<#${channel.id}>`;
  if (channelId && /^\d{17,20}$/.test(channelId)) {
    return t(locale, 'setup.unavailableChannel', { channelId });
  }
  return t(locale, 'setup.notConfigured');
}

function customIdChannelValue(channelId) {
  return channelId && /^\d{17,20}$/.test(channelId) ? channelId : 'none';
}

function buildV2Payload(container) {
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

function buildLoadingPayload(locale = 'en') {
  return {
    ...buildV2Payload(
      new ContainerBuilder()
        .setAccentColor(0x5865f2)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(t(locale, 'setup.loading'))
        )
    ),
    flags: SETUP_MESSAGE_FLAGS,
  };
}

function buildErrorPayload(message, locale = 'en') {
  return buildV2Payload(
    new ContainerBuilder()
      .setAccentColor(0xef4444)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`${t(locale, 'setup.unavailable')}\n${message}`)
      )
  );
}

function getMissingPermissions(channel, botMember, requirements) {
  const permissions = botMember.permissionsIn(channel);
  return requirements
    .filter(({ flag }) => !permissions.has(flag))
    .map(({ label }) => label);
}

function validateSelectedChannels(guild, logChannel, lfgChannel, locale = 'en') {
  if (
    !isAllowedTextChannel(logChannel, guild.id)
    || !isAllowedTextChannel(lfgChannel, guild.id)
  ) {
    return t(locale, 'setup.selectServerTextChannels');
  }
  if (logChannel.id === lfgChannel.id) {
    return t(locale, 'setup.channelsMustDiffer');
  }
  const botMember = guild.members.me;
  if (!botMember) {
    return t(locale, 'setup.permissionCheckFailedRetry');
  }

  const logMissing = getMissingPermissions(logChannel, botMember, [
    { flag: PermissionFlagsBits.ViewChannel, label: t(locale, 'setup.viewChannel') },
    { flag: PermissionFlagsBits.SendMessages, label: t(locale, 'setup.sendMessages') },
  ]);
  if (logMissing.length > 0) {
    return t(locale, 'setup.missingPermissionsChannel', { permissions: logMissing.join(', '), channelId: logChannel.id });
  }

  const lfgMissing = getMissingPermissions(lfgChannel, botMember, [
    { flag: PermissionFlagsBits.ViewChannel, label: t(locale, 'setup.viewChannel') },
    { flag: PermissionFlagsBits.SendMessages, label: t(locale, 'setup.sendMessages') },
    { flag: PermissionFlagsBits.ReadMessageHistory, label: t(locale, 'setup.readHistory') },
    { flag: PermissionFlagsBits.EmbedLinks, label: t(locale, 'setup.embedLinks') },
  ]);
  if (lfgMissing.length > 0) {
    return t(locale, 'setup.missingPermissionsChannel', { permissions: lfgMissing.join(', '), channelId: lfgChannel.id });
  }
  return null;
}

function validateLobby(guild, channel, role, { manual = false, locale = 'en' } = {}) {
  if (!channel || channel.guildId !== guild.id) {
    return t(locale, 'setup.lobbyUnavailable');
  }
  if (manual && channel.type !== ChannelType.GuildVoice) {
    return t(locale, 'setup.manualRequiresVoice');
  }
  if (!isExistingVoiceChannel(channel, guild.id)) {
    return t(locale, 'setup.lobbyNotVoice');
  }
  if (!role || role.guild?.id !== guild.id || role.id === guild.id) {
    return t(locale, 'setup.roleUnavailable');
  }
  if (manual && role.managed) {
    return t(locale, 'setup.roleManaged');
  }

  const botMember = guild.members.me;
  if (!botMember) {
    return t(locale, 'setup.permissionCheckFailed');
  }
  const guildRequirements = [
    { flag: PermissionFlagsBits.ManageChannels, label: t(locale, 'setup.manageChannels') },
    { flag: PermissionFlagsBits.ManageRoles, label: t(locale, 'setup.manageRoles') },
    { flag: PermissionFlagsBits.MoveMembers, label: t(locale, 'setup.moveMembers') },
  ];
  const missingGuildPermissions = guildRequirements
    .filter(({ flag }) => !botMember.permissions.has(flag))
    .map(({ label }) => label);
  if (missingGuildPermissions.length > 0) {
    return t(locale, 'setup.missingPermissionsServer', { permissions: missingGuildPermissions.join(', ') });
  }

  const missingChannelPermissions = getMissingPermissions(channel, botMember, [
    { flag: PermissionFlagsBits.ViewChannel, label: t(locale, 'setup.viewChannel') },
    { flag: PermissionFlagsBits.ManageChannels, label: t(locale, 'setup.manageChannels') },
    { flag: PermissionFlagsBits.Connect, label: t(locale, 'setup.connect') },
    { flag: PermissionFlagsBits.MoveMembers, label: t(locale, 'setup.moveMembers') },
    { flag: PermissionFlagsBits.SendMessages, label: t(locale, 'setup.sendMessages') },
    { flag: PermissionFlagsBits.ReadMessageHistory, label: t(locale, 'setup.readHistory') },
  ]);
  if (missingChannelPermissions.length > 0) {
    return t(locale, 'setup.missingPermissionsChannel', { permissions: missingChannelPermissions.join(', '), channelId: channel.id });
  }
  if (!role.mentionable && !botMember.permissions.has(PermissionFlagsBits.MentionEveryone)) {
    return t(locale, 'setup.roleMentionable', { roleId: role.id });
  }
  return null;
}

async function resolveLobbyState(guild, lobby, locale = 'en') {
  const [channel, role] = await Promise.all([
    lobby.channelId
      ? guild.channels.fetch(lobby.channelId).catch(() => null)
      : Promise.resolve(null),
    lobby.roleId
      ? guild.roles.fetch(lobby.roleId).catch(() => null)
      : Promise.resolve(null),
  ]);
  const validationError = validateLobby(guild, channel, role, { locale });
  return { lobby, channel, role, validationError };
}

function step1ButtonCustomId(state) {
  const logChannelId = customIdChannelValue(state.config.logChannelId);
  const lfgChannelId = customIdChannelValue(state.config.lfgChannelId);
  const configVersion = state.config.configVersion || 'none';
  return `${STEP1_CHANGE_PREFIX}:${logChannelId}:${lfgChannelId}:${configVersion}`;
}

function addNotice(container, notice, locale = 'en') {
  if (!notice) return container;
  return container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${t(locale, 'setup.notice')}\n${notice}`)
    );
}

function buildStep1Payload(state, notice = null) {
  const locale = normalizeLocale(state.config.locale);
  const ready = state.step1Ready;
  const section = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        t(locale, 'setup.status', { status: t(locale, ready ? 'setup.ready' : 'setup.needsAttention') }),
        t(locale, 'setup.logChannel', { channel: formatConfiguredChannel(state.config.logChannelId, state.logChannel, locale) }),
        t(locale, 'setup.lfgChannel', { channel: formatConfiguredChannel(state.config.lfgChannelId, state.lfgChannel, locale) }),
        state.step1Error ? t(locale, 'setup.issue', { issue: state.step1Error }) : null,
      ].filter(Boolean).join('\n'))
    )
    .setButtonAccessory(
      new ButtonBuilder()
        .setCustomId(step1ButtonCustomId(state))
        .setLabel(t(locale, ready ? 'setup.change' : 'setup.setUp'))
        .setStyle(ButtonStyle.Primary)
    );
  const container = new ContainerBuilder()
    .setAccentColor(ready ? 0x22c55e : 0xf59e0b)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${t(locale, 'setup.step1Title')}\n${t(locale, 'setup.step1Help')}`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addSectionComponents(section);
  if (ready) {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(STEP1_CONTINUE_ID)
          .setLabel(t(locale, 'setup.continueStep2'))
          .setStyle(ButtonStyle.Success)
      )
    );
  }
  return buildV2Payload(addNotice(container, notice, locale));
}

function firstValidLobby(state) {
  return state.validLobbies[0] || null;
}

function manualButtonCustomId(state) {
  const existing = firstValidLobby(state);
  return `${MANUAL_SETUP_PREFIX}:${existing?.channel?.id || 'none'}:${existing?.role?.id || 'none'}`;
}

function buildStep2Payload(state, notice = null) {
  const locale = normalizeLocale(state.config.locale);
  const configured = state.step2Ready;
  const quickNeedsRecovery = Boolean(state.setupOperation);
  const quickSection = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${t(locale, 'setup.quickSetup')}\n${t(locale, 'setup.quickSetupHelp')}`
      )
    )
    .setButtonAccessory(
      new ButtonBuilder()
        .setCustomId(quickNeedsRecovery ? QUICK_RECOVER_ID : QUICK_SETUP_ID)
        .setLabel(t(locale, quickNeedsRecovery ? 'setup.finishSetup' : configured ? 'setup.alreadySet' : 'setup.quickSetupButton'))
        .setStyle(ButtonStyle.Success)
        .setDisabled(configured && !quickNeedsRecovery)
    );
  const manualSection = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${t(locale, 'setup.manualSetup')}\n${t(locale, 'setup.manualSetupHelp')}`
      )
    )
    .setButtonAccessory(
      new ButtonBuilder()
        .setCustomId(manualButtonCustomId(state))
        .setLabel(t(locale, configured ? 'setup.addUpdate' : 'setup.manualSetupButton'))
        .setStyle(ButtonStyle.Primary)
    );
  const existingSummary = configured
    ? `\n\n${t(locale, 'setup.configuredSummary', {
      items: state.validLobbies.slice(0, 3).map(
        (item) => t(locale, 'setup.configuredLobby', { channelId: item.channel.id, roleId: item.role.id })
      ).join(', '),
      more: state.validLobbies.length > 3
        ? t(locale, 'setup.andMoreInline', { count: state.validLobbies.length - 3 })
        : '',
    })}`
    : '';
  const container = new ContainerBuilder()
    .setAccentColor(configured ? 0x22c55e : 0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${t(locale, 'setup.step2Title')}\n${t(locale, 'setup.step2Help', { summary: existingSummary })}`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addSectionComponents(quickSection)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addSectionComponents(manualSection)
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(STEP1_BACK_ID)
          .setLabel(t(locale, 'setup.backStep1'))
          .setStyle(ButtonStyle.Secondary)
      )
    );
  if (state.invalidLobbies.length > 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        t(locale, 'setup.invalidLobbyCount', { count: state.invalidLobbies.length })
      )
    );
  }
  if (quickNeedsRecovery) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        t(locale, 'setup.recoveryNotice')
      )
    );
  }
  return buildV2Payload(addNotice(container, notice, locale));
}

function buildCompletePayload(state, notice = null) {
  const locale = normalizeLocale(state.config.locale);
  const lobbyLines = state.validLobbies.slice(0, 5).map(
    (item) => t(locale, 'setup.usingRole', { channelId: item.channel.id, roleId: item.role.id })
  );
  if (state.validLobbies.length > 5) {
    lobbyLines.push(t(locale, 'setup.andMore', { count: state.validLobbies.length - 5 }));
  }
  const container = new ContainerBuilder()
    .setAccentColor(0x22c55e)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        t(locale, 'setup.completeTitle'),
        t(locale, 'setup.step1Summary'),
        t(locale, 'setup.logSummary', { channelId: state.logChannel.id }),
        t(locale, 'setup.lfgSummary', { channelId: state.lfgChannel.id }),
        '',
        t(locale, 'setup.step2Summary'),
        ...lobbyLines,
        '',
        t(locale, 'setup.roleHelp'),
      ].join('\n'))
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(step1ButtonCustomId(state))
          .setLabel(t(locale, 'setup.changeChannels'))
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(STEP2_MANAGE_ID)
          .setLabel(t(locale, 'setup.manageJtc'))
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(SETUP_REFRESH_ID)
          .setLabel(t(locale, 'setup.runCheck'))
          .setStyle(ButtonStyle.Secondary)
      )
    );
  if (state.invalidLobbies.length > 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        t(locale, 'setup.invalidLobbyWarning', { count: state.invalidLobbies.length })
      )
    );
  }
  if (state.setupOperation) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        t(locale, 'setup.cleanupWarning')
      )
    );
  }
  return buildV2Payload(addNotice(container, notice, locale));
}

function buildPanelForState(state, preferredView = null, notice = null) {
  if (preferredView === 'step1' || !state.step1Ready) {
    return buildStep1Payload(state, notice);
  }
  if (preferredView === 'step2' || !state.step2Ready) {
    return buildStep2Payload(state, notice);
  }
  return buildCompletePayload(state, notice);
}

function buildChannelSelect(customId, placeholder, channelTypes, defaultChannelId) {
  const select = new ChannelSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .setChannelTypes(...channelTypes)
    .setMinValues(1)
    .setMaxValues(1)
    .setRequired(true);
  if (defaultChannelId) select.setDefaultChannels(defaultChannelId);
  return select;
}

function buildStep1Modal(guild, logChannelId, lfgChannelId, configVersion, locale = 'en') {
  const validLogId = isAllowedTextChannel(guild.channels.cache.get(logChannelId), guild.id)
    ? logChannelId
    : null;
  const validLfgId = isAllowedTextChannel(guild.channels.cache.get(lfgChannelId), guild.id)
    ? lfgChannelId
    : null;
  return new ModalBuilder()
    .setCustomId(`${STEP1_MODAL_ID}:${configVersion}`)
    .setTitle(t(locale, 'setup.step1Modal'))
    .addLabelComponents(
      new LabelBuilder()
        .setLabel(t(locale, 'setup.logChannelLabel'))
        .setDescription(t(locale, 'setup.logChannelDescription'))
        .setChannelSelectMenuComponent(
          buildChannelSelect(
            LOG_CHANNEL_SELECT_ID,
            t(locale, 'setup.selectLogChannel'),
            TEXT_CHANNEL_TYPES,
            validLogId
          )
        ),
      new LabelBuilder()
        .setLabel(t(locale, 'setup.lfgChannelLabel'))
        .setDescription(t(locale, 'setup.lfgChannelDescription'))
        .setChannelSelectMenuComponent(
          buildChannelSelect(
            LFG_CHANNEL_SELECT_ID,
            t(locale, 'setup.selectLfgChannel'),
            TEXT_CHANNEL_TYPES,
            validLfgId
          )
        )
    );
}

function buildQuickSetupModal(locale = 'en') {
  return new ModalBuilder()
    .setCustomId(QUICK_MODAL_ID)
    .setTitle(t(locale, 'setup.quickSetupModal'))
    .addLabelComponents(
      new LabelBuilder()
        .setLabel(t(locale, 'setup.voiceCategory'))
        .setDescription(t(locale, 'setup.voiceCategoryDescription'))
        .setChannelSelectMenuComponent(
          buildChannelSelect(
            CATEGORY_SELECT_ID,
            t(locale, 'setup.selectVoiceCategory'),
            [ChannelType.GuildCategory],
            null
          )
        )
    );
}

function buildManualSetupModal(guild, channelId, roleId, locale = 'en') {
  const validChannelId = guild.channels.cache.get(channelId)?.type === ChannelType.GuildVoice
    ? channelId
    : null;
  const validRoleId = guild.roles.cache.has(roleId) ? roleId : null;
  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId(LOBBY_ROLE_SELECT_ID)
    .setPlaceholder(t(locale, 'setup.selectNotificationRole'))
    .setMinValues(1)
    .setMaxValues(1)
    .setRequired(true);
  if (validRoleId) roleSelect.setDefaultRoles(validRoleId);

  return new ModalBuilder()
    .setCustomId(MANUAL_MODAL_ID)
    .setTitle(t(locale, 'setup.manualSetupModal'))
    .addLabelComponents(
      new LabelBuilder()
        .setLabel(t(locale, 'setup.lobbyLabel'))
        .setDescription(t(locale, 'setup.lobbyDescription'))
        .setChannelSelectMenuComponent(
          buildChannelSelect(
            LOBBY_CHANNEL_SELECT_ID,
            t(locale, 'setup.selectVoiceChannel'),
            VOICE_CHANNEL_TYPES,
            validChannelId
          )
        ),
      new LabelBuilder()
        .setLabel(t(locale, 'setup.roleLabel'))
        .setDescription(t(locale, 'setup.roleDescription'))
        .setRoleSelectMenuComponent(roleSelect)
    );
}

function hasSetupAccess(interaction) {
  return Boolean(
    interaction.guildId
    && interaction.guild
    && interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
  );
}

async function denySetupAccess(interaction, configStore) {
  const locale = await getGuildLocale(configStore, interaction.guildId);
  const content = interaction.guildId
    ? t(locale, 'setup.adminOnly')
    : t(locale, 'common.serverOnlyCommand');
  await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => null);
}

function createSetupManager({ configStore, onGuildConfigUpdated = () => {} }) {
  const quickProvisioner = createQuickSetupProvisioner({
    configStore,
    onGuildConfigUpdated,
  });

  async function loadSetupState(guild) {
    const config = await configStore.getGuildConfig(guild.id);
    const [logChannel, lfgChannel, lobbies, setupOperation] = await Promise.all([
      resolveConfiguredChannel(guild, config.logChannelId, isAllowedTextChannel),
      resolveConfiguredChannel(guild, config.lfgChannelId, isAllowedTextChannel),
      Promise.all((config.joinToCreateLobbies || []).map(
        (lobby) => resolveLobbyState(guild, lobby, config.locale)
      )),
      configStore.getGuildSetupOperation(guild.id),
    ]);
    const step1Error = logChannel && lfgChannel
      ? validateSelectedChannels(guild, logChannel, lfgChannel, config.locale)
      : null;
    const validLobbies = lobbies.filter((item) => !item.validationError);
    const invalidLobbies = lobbies.filter((item) => item.validationError);
    return {
      config,
      logChannel,
      lfgChannel,
      lobbies,
      validLobbies,
      invalidLobbies,
      setupOperation,
      step1Error,
      step1Ready: Boolean(logChannel && lfgChannel && !step1Error),
      step2Ready: validLobbies.length > 0,
    };
  }

  async function editLoadedPanel(interaction, preferredView = null, notice = null) {
    try {
      const state = await loadSetupState(interaction.guild);
      await interaction.editReply(buildPanelForState(state, preferredView, notice));
    } catch (error) {
      console.error('Failed to load guild setup:', error);
      const locale = await getGuildLocale(configStore, interaction.guildId);
      await interaction.editReply(
        buildErrorPayload(t(locale, 'setup.loadFailed'), locale)
      ).catch(() => null);
    }
  }

  async function showSetup(interaction) {
    if (!hasSetupAccess(interaction)) {
      await denySetupAccess(interaction, configStore);
      return;
    }
    const locale = await getGuildLocale(configStore, interaction.guildId);
    await interaction.reply(buildLoadingPayload(locale));
    await editLoadedPanel(interaction);
  }

  async function showStep1Modal(interaction) {
    if (!hasSetupAccess(interaction)) {
      await denySetupAccess(interaction, configStore);
      return;
    }
    const [, logChannelId, lfgChannelId, configVersion] = interaction.customId.split(':');
    const locale = await getGuildLocale(configStore, interaction.guildId);
    await interaction.showModal(
      buildStep1Modal(interaction.guild, logChannelId, lfgChannelId, configVersion, locale)
    );
  }

  async function saveStep1(interaction) {
    if (!hasSetupAccess(interaction)) {
      await denySetupAccess(interaction, configStore);
      return;
    }
    let logChannel;
    let lfgChannel;
    const locale = await getGuildLocale(configStore, interaction.guildId);
    try {
      logChannel = interaction.fields
        .getSelectedChannels(LOG_CHANNEL_SELECT_ID, true, TEXT_CHANNEL_TYPES)
        .first();
      lfgChannel = interaction.fields
        .getSelectedChannels(LFG_CHANNEL_SELECT_ID, true, TEXT_CHANNEL_TYPES)
        .first();
    } catch {
      await interaction.reply({
        content: t(locale, 'setup.channelsRequired'),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const validationError = validateSelectedChannels(interaction.guild, logChannel, lfgChannel, locale);
    if (validationError) {
      await interaction.reply({
        content: validationError,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
      return;
    }

    await interaction.deferUpdate();
    const [, expectedValue] = interaction.customId.split(':');
    const expectedVersion = expectedValue === 'none' ? null : expectedValue;
    let savedVersion;
    try {
      savedVersion = await configStore.setGuildChannels(
        interaction.guildId,
        logChannel.id,
        lfgChannel.id,
        expectedVersion
      );
    } catch (error) {
      console.error('Failed to save Step 1 channels:', error);
      await editLoadedPanel(
        interaction,
        'step1',
        t(locale, 'setup.channelsSaveFailed')
      );
      return;
    }
    if (!savedVersion) {
      await editLoadedPanel(
        interaction,
        'step1',
        t(locale, 'setup.configChanged')
      );
      return;
    }
    onGuildConfigUpdated(interaction.guildId);
    await editLoadedPanel(interaction, null, t(locale, 'setup.step1Saved'));
  }

  async function showQuickModal(interaction) {
    if (!hasSetupAccess(interaction)) {
      await denySetupAccess(interaction, configStore);
      return;
    }
    const locale = await getGuildLocale(configStore, interaction.guildId);
    await interaction.showModal(buildQuickSetupModal(locale));
  }

  async function runQuickRecovery(interaction) {
    if (!hasSetupAccess(interaction)) {
      await denySetupAccess(interaction, configStore);
      return;
    }
    const locale = await getGuildLocale(configStore, interaction.guildId);
    await interaction.deferUpdate();
    const result = await quickProvisioner.provision(
      interaction.guild,
      null,
      { recoveryOnly: true }
    );
    if (result.status === 'already_configured') {
      await editLoadedPanel(
        interaction,
        null,
        t(locale, 'setup.recoveryComplete')
      );
      return;
    }
    if (result.status === 'recovery_complete') {
      await editLoadedPanel(
        interaction,
        null,
        t(locale, 'setup.recoveryCleaned')
      );
      return;
    }
    if (result.status === 'in_progress') {
      await editLoadedPanel(
        interaction,
        'step2',
        t(locale, 'setup.stillRunning')
      );
      return;
    }
    if (result.status === 'cleanup_required') {
      await editLoadedPanel(
        interaction,
        'step2',
        t(locale, 'setup.cleanupIncomplete', {
          channelId: result.operation?.channelId || '-',
          roleId: result.operation?.roleId || '-',
        })
      );
      return;
    }
    console.error('Quick Setup recovery failed:', result.error, result.cleanupErrors);
    await editLoadedPanel(
      interaction,
      'step2',
      t(locale, 'setup.recoveryFailed')
    );
  }

  async function runQuickSetup(interaction) {
    if (!hasSetupAccess(interaction)) {
      await denySetupAccess(interaction, configStore);
      return;
    }
    let category;
    const locale = await getGuildLocale(configStore, interaction.guildId);
    try {
      category = interaction.fields
        .getSelectedChannels(CATEGORY_SELECT_ID, true, [ChannelType.GuildCategory])
        .first();
    } catch {
      await interaction.reply({
        content: t(locale, 'setup.categoryRequired'),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const permissionError = getQuickSetupPermissionError(interaction.guild, category, locale);
    if (permissionError) {
      await interaction.reply({
        content: permissionError,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferUpdate();
    const result = await quickProvisioner.provision(interaction.guild, category);
    if (result.status === 'created') {
      await editLoadedPanel(
        interaction,
        null,
        t(locale, 'setup.created', { channelId: result.channel.id, roleId: result.role.id })
      );
      return;
    }
    if (result.status === 'created_cleanup_required') {
      await editLoadedPanel(
        interaction,
        null,
        t(locale, 'setup.createdCleanup', { channelId: result.channel.id, roleId: result.role.id })
      );
      return;
    }
    if (result.status === 'already_configured') {
      await editLoadedPanel(
        interaction,
        null,
        t(locale, 'setup.alreadyConfigured', { channelId: result.channel.id, roleId: result.role.id })
      );
      return;
    }
    if (result.status === 'saved_needs_attention') {
      await editLoadedPanel(
        interaction,
        'step2',
        t(locale, 'setup.savedNeedsAttention')
      );
      return;
    }
    if (result.status === 'name_conflict') {
      const resources = [
        result.channel ? `<#${result.channel.id}>` : null,
        result.role ? `<@&${result.role.id}>` : null,
      ].filter(Boolean).join(t(locale, 'setup.resourceJoiner'));
      await editLoadedPanel(
        interaction,
        'step2',
        t(locale, 'setup.nameConflict', { resources: resources || t(locale, 'setup.matchingResources') })
      );
      return;
    }
    if (result.status === 'in_progress') {
      await editLoadedPanel(
        interaction,
        'step2',
        t(locale, 'setup.alreadyRunning')
      );
      return;
    }
    if (result.status === 'configuration_changed') {
      await editLoadedPanel(
        interaction,
        null,
        t(locale, 'setup.configurationChanged')
      );
      return;
    }
    if (result.status === 'cleanup_required') {
      await editLoadedPanel(
        interaction,
        'step2',
        t(locale, 'setup.previousCleanup', {
          channelId: result.operation?.channelId || '-',
          roleId: result.operation?.roleId || '-',
        })
      );
      return;
    }
    if (result.status === 'verification_required') {
      const retryMessage = result.retryAfterMinutes > 0
        ? t(locale, 'setup.verifyWait', { minutes: result.retryAfterMinutes })
        : t(locale, 'setup.verifyRetry');
      await editLoadedPanel(
        interaction,
        'step2',
        t(locale, 'setup.verificationRequired', {
          retry: retryMessage,
          channelId: result.channelId,
          roleId: result.roleId,
        })
      );
      return;
    }
    if (result.status === 'invalid') {
      await editLoadedPanel(interaction, 'step2', result.error);
      return;
    }

    console.error('Quick Setup failed:', result.error, result.cleanupErrors);
    const cleanupNote = result.cleanupErrors?.length
      ? t(locale, 'setup.automaticCleanupIncomplete', {
        channelId: result.channelId || '-',
        roleId: result.roleId || '-',
      })
      : '';
    await editLoadedPanel(
      interaction,
      'step2',
      t(locale, 'setup.quickSetupFailed', { cleanup: cleanupNote })
    );
  }

  async function showManualModal(interaction) {
    if (!hasSetupAccess(interaction)) {
      await denySetupAccess(interaction, configStore);
      return;
    }
    const [, channelId, roleId] = interaction.customId.split(':');
    const locale = await getGuildLocale(configStore, interaction.guildId);
    await interaction.showModal(
      buildManualSetupModal(interaction.guild, channelId, roleId, locale)
    );
  }

  async function saveManualSetup(interaction) {
    if (!hasSetupAccess(interaction)) {
      await denySetupAccess(interaction, configStore);
      return;
    }
    let channel;
    let role;
    const locale = await getGuildLocale(configStore, interaction.guildId);
    try {
      channel = interaction.fields
        .getSelectedChannels(LOBBY_CHANNEL_SELECT_ID, true, VOICE_CHANNEL_TYPES)
        .first();
      role = interaction.fields.getSelectedRoles(LOBBY_ROLE_SELECT_ID, true).first();
    } catch {
      await interaction.reply({
        content: t(locale, 'setup.lobbyRoleRequired'),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const validationError = validateLobby(interaction.guild, channel, role, { manual: true, locale });
    if (validationError) {
      await interaction.reply({
        content: validationError,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
      return;
    }

    await interaction.deferUpdate();
    try {
      await configStore.upsertJoinToCreateLobby({
        guildId: interaction.guildId,
        channelId: channel.id,
        roleId: role.id,
        lfgEnabled: true,
        lfgReminderEnabled: false,
        lfgReminderSeconds: 30,
      });
      onGuildConfigUpdated(interaction.guildId);
      await editLoadedPanel(
        interaction,
        null,
        t(locale, 'setup.manualConfigured', { channelId: channel.id, roleId: role.id })
      );
    } catch (error) {
      console.error('Failed to save Manual Setup:', error);
      await editLoadedPanel(
        interaction,
        'step2',
        error?.code === 'SETUP_RESOURCE_RECOVERY'
          ? t(locale, 'setup.manualBlocked')
          : t(locale, 'setup.manualSaveFailed')
      );
    }
  }

  async function refreshView(interaction, preferredView) {
    if (!hasSetupAccess(interaction)) {
      await denySetupAccess(interaction, configStore);
      return;
    }
    await interaction.deferUpdate();
    await editLoadedPanel(interaction, preferredView);
  }

  async function handleInteraction(interaction) {
    if (interaction.isChatInputCommand() && interaction.commandName === SETUP_COMMAND) {
      await showSetup(interaction);
      return true;
    }
    if (interaction.isButton()) {
      if (interaction.customId.startsWith(`${STEP1_CHANGE_PREFIX}:`)) {
        await showStep1Modal(interaction);
        return true;
      }
      if (interaction.customId === STEP1_CONTINUE_ID || interaction.customId === STEP2_MANAGE_ID) {
        await refreshView(interaction, 'step2');
        return true;
      }
      if (interaction.customId === STEP1_BACK_ID) {
        await refreshView(interaction, 'step1');
        return true;
      }
      if (interaction.customId === SETUP_REFRESH_ID) {
        await refreshView(interaction, null);
        return true;
      }
      if (interaction.customId === QUICK_SETUP_ID) {
        await showQuickModal(interaction);
        return true;
      }
      if (interaction.customId === QUICK_RECOVER_ID) {
        await runQuickRecovery(interaction);
        return true;
      }
      if (interaction.customId.startsWith(`${MANUAL_SETUP_PREFIX}:`)) {
        await showManualModal(interaction);
        return true;
      }
    }
    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith(`${STEP1_MODAL_ID}:`)) {
        await saveStep1(interaction);
        return true;
      }
      if (interaction.customId === QUICK_MODAL_ID) {
        await runQuickSetup(interaction);
        return true;
      }
      if (interaction.customId === MANUAL_MODAL_ID) {
        await saveManualSetup(interaction);
        return true;
      }
    }
    return false;
  }

  return { handleInteraction };
}

module.exports = {
  buildSetupCommand,
  createSetupManager,
};
