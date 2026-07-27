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
    .setDescription('Configure the bot channels and Join-to-Create lobby')
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

function formatConfiguredChannel(channelId, channel) {
  if (channel) return `<#${channel.id}>`;
  if (channelId && /^\d{17,20}$/.test(channelId)) {
    return `Unavailable channel (\`${channelId}\`)`;
  }
  return 'Not configured';
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

function buildLoadingPayload() {
  return {
    ...buildV2Payload(
      new ContainerBuilder()
        .setAccentColor(0x5865f2)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent('### Loading bot setup...')
        )
    ),
    flags: SETUP_MESSAGE_FLAGS,
  };
}

function buildErrorPayload(message) {
  return buildV2Payload(
    new ContainerBuilder()
      .setAccentColor(0xef4444)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`### Setup unavailable\n${message}`)
      )
  );
}

function getMissingPermissions(channel, botMember, requirements) {
  const permissions = botMember.permissionsIn(channel);
  return requirements
    .filter(({ flag }) => !permissions.has(flag))
    .map(({ label }) => label);
}

function validateSelectedChannels(guild, logChannel, lfgChannel) {
  if (
    !isAllowedTextChannel(logChannel, guild.id)
    || !isAllowedTextChannel(lfgChannel, guild.id)
  ) {
    return 'Select text or announcement channels from this server.';
  }
  if (logChannel.id === lfgChannel.id) {
    return 'The Log channel and LFG channel must be different.';
  }
  const botMember = guild.members.me;
  if (!botMember) {
    return 'The bot could not verify its server permissions. Please try again.';
  }

  const logMissing = getMissingPermissions(logChannel, botMember, [
    { flag: PermissionFlagsBits.ViewChannel, label: 'View Channel' },
    { flag: PermissionFlagsBits.SendMessages, label: 'Send Messages' },
  ]);
  if (logMissing.length > 0) {
    return `The bot is missing ${logMissing.join(', ')} in <#${logChannel.id}>.`;
  }

  const lfgMissing = getMissingPermissions(lfgChannel, botMember, [
    { flag: PermissionFlagsBits.ViewChannel, label: 'View Channel' },
    { flag: PermissionFlagsBits.SendMessages, label: 'Send Messages' },
    { flag: PermissionFlagsBits.ReadMessageHistory, label: 'Read Message History' },
    { flag: PermissionFlagsBits.EmbedLinks, label: 'Embed Links' },
  ]);
  if (lfgMissing.length > 0) {
    return `The bot is missing ${lfgMissing.join(', ')} in <#${lfgChannel.id}>.`;
  }
  return null;
}

function validateLobby(guild, channel, role, { manual = false } = {}) {
  if (!channel || channel.guildId !== guild.id) {
    return 'The lobby channel is unavailable.';
  }
  if (manual && channel.type !== ChannelType.GuildVoice) {
    return 'Manual Setup requires a regular voice channel.';
  }
  if (!isExistingVoiceChannel(channel, guild.id)) {
    return 'The configured lobby is not a voice channel.';
  }
  if (!role || role.guild?.id !== guild.id || role.id === guild.id) {
    return 'The notification role is unavailable.';
  }
  if (manual && role.managed) {
    return 'Select a role that is not managed by another integration.';
  }

  const botMember = guild.members.me;
  if (!botMember) {
    return 'The bot could not verify its server permissions.';
  }
  const guildRequirements = [
    { flag: PermissionFlagsBits.ManageChannels, label: 'Manage Channels' },
    { flag: PermissionFlagsBits.ManageRoles, label: 'Manage Roles' },
    { flag: PermissionFlagsBits.MoveMembers, label: 'Move Members' },
  ];
  const missingGuildPermissions = guildRequirements
    .filter(({ flag }) => !botMember.permissions.has(flag))
    .map(({ label }) => label);
  if (missingGuildPermissions.length > 0) {
    return `The bot is missing ${missingGuildPermissions.join(', ')} in this server.`;
  }

  const missingChannelPermissions = getMissingPermissions(channel, botMember, [
    { flag: PermissionFlagsBits.ViewChannel, label: 'View Channel' },
    { flag: PermissionFlagsBits.ManageChannels, label: 'Manage Channels' },
    { flag: PermissionFlagsBits.Connect, label: 'Connect' },
    { flag: PermissionFlagsBits.MoveMembers, label: 'Move Members' },
    { flag: PermissionFlagsBits.SendMessages, label: 'Send Messages' },
    { flag: PermissionFlagsBits.ReadMessageHistory, label: 'Read Message History' },
  ]);
  if (missingChannelPermissions.length > 0) {
    return `The bot is missing ${missingChannelPermissions.join(', ')} in <#${channel.id}>.`;
  }
  if (!role.mentionable && !botMember.permissions.has(PermissionFlagsBits.MentionEveryone)) {
    return `Make <@&${role.id}> mentionable, or give the bot Mention Everyone.`;
  }
  return null;
}

async function resolveLobbyState(guild, lobby) {
  const [channel, role] = await Promise.all([
    lobby.channelId
      ? guild.channels.fetch(lobby.channelId).catch(() => null)
      : Promise.resolve(null),
    lobby.roleId
      ? guild.roles.fetch(lobby.roleId).catch(() => null)
      : Promise.resolve(null),
  ]);
  const validationError = validateLobby(guild, channel, role);
  return { lobby, channel, role, validationError };
}

function step1ButtonCustomId(state) {
  const logChannelId = customIdChannelValue(state.config.logChannelId);
  const lfgChannelId = customIdChannelValue(state.config.lfgChannelId);
  const configVersion = state.config.configVersion || 'none';
  return `${STEP1_CHANGE_PREFIX}:${logChannelId}:${lfgChannelId}:${configVersion}`;
}

function addNotice(container, notice) {
  if (!notice) return container;
  return container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**Notice**\n${notice}`)
    );
}

function buildStep1Payload(state, notice = null) {
  const ready = state.step1Ready;
  const section = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `**Status:** ${ready ? 'Ready' : 'Needs attention'}`,
        `**Log channel:** ${formatConfiguredChannel(state.config.logChannelId, state.logChannel)}`,
        `**LFG channel:** ${formatConfiguredChannel(state.config.lfgChannelId, state.lfgChannel)}`,
        state.step1Error ? `**Issue:** ${state.step1Error}` : null,
      ].filter(Boolean).join('\n'))
    )
    .setButtonAccessory(
      new ButtonBuilder()
        .setCustomId(step1ButtonCustomId(state))
        .setLabel(ready ? 'Change' : 'Set Up')
        .setStyle(ButtonStyle.Primary)
    );
  const container = new ContainerBuilder()
    .setAccentColor(ready ? 0x22c55e : 0xf59e0b)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '### Step 1 of 2: Message Channels\nChoose where bot logs and LFG posts should be sent.'
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addSectionComponents(section);
  if (ready) {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(STEP1_CONTINUE_ID)
          .setLabel('Continue to Step 2')
          .setStyle(ButtonStyle.Success)
      )
    );
  }
  return buildV2Payload(addNotice(container, notice));
}

function firstValidLobby(state) {
  return state.validLobbies[0] || null;
}

function manualButtonCustomId(state) {
  const existing = firstValidLobby(state);
  return `${MANUAL_SETUP_PREFIX}:${existing?.channel?.id || 'none'}:${existing?.role?.id || 'none'}`;
}

function buildStep2Payload(state, notice = null) {
  const configured = state.step2Ready;
  const quickNeedsRecovery = Boolean(state.setupOperation);
  const quickSection = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '**Quick Setup**\nBest for new servers. Creates `+ New Group Channel` and a mentionable `@LFG` notification role in your chosen category.'
      )
    )
    .setButtonAccessory(
      new ButtonBuilder()
        .setCustomId(quickNeedsRecovery ? QUICK_RECOVER_ID : QUICK_SETUP_ID)
        .setLabel(quickNeedsRecovery ? 'Finish Setup' : configured ? 'Already Set' : 'Quick Setup')
        .setStyle(ButtonStyle.Success)
        .setDisabled(configured && !quickNeedsRecovery)
    );
  const manualSection = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '**Manual Setup**\nUse an existing voice channel and notification role. The selected lobby is added or updated without removing other lobbies.'
      )
    )
    .setButtonAccessory(
      new ButtonBuilder()
        .setCustomId(manualButtonCustomId(state))
        .setLabel(configured ? 'Add / Update' : 'Manual Setup')
        .setStyle(ButtonStyle.Primary)
    );
  const existingSummary = configured
    ? `\n\nCurrently configured: ${state.validLobbies.slice(0, 3).map(
      (item) => `<#${item.channel.id}> with <@&${item.role.id}>`
    ).join(', ')}${state.validLobbies.length > 3 ? ` and ${state.validLobbies.length - 3} more` : ''}.`
    : '';
  const container = new ContainerBuilder()
    .setAccentColor(configured ? 0x22c55e : 0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### Step 2 of 2: Join-to-Create\nChoose how to configure at least one Join-to-Create lobby.${existingSummary}`
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
          .setLabel('Back to Step 1')
          .setStyle(ButtonStyle.Secondary)
      )
    );
  if (state.invalidLobbies.length > 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# ${state.invalidLobbies.length} saved lobby configuration(s) need attention in the dashboard.`
      )
    );
  }
  if (quickNeedsRecovery) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '-# Quick Setup has an unfinished verification or cleanup record. Use Finish Setup to reconcile it.'
      )
    );
  }
  return buildV2Payload(addNotice(container, notice));
}

function buildCompletePayload(state, notice = null) {
  const lobbyLines = state.validLobbies.slice(0, 5).map(
    (item) => `- <#${item.channel.id}> using <@&${item.role.id}>`
  );
  if (state.validLobbies.length > 5) {
    lobbyLines.push(`- ...and ${state.validLobbies.length - 5} more`);
  }
  const container = new ContainerBuilder()
    .setAccentColor(0x22c55e)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        '### Bot Setup Complete',
        '**Step 1: Message Channels**',
        `- Log: <#${state.logChannel.id}>`,
        `- LFG: <#${state.lfgChannel.id}>`,
        '',
        '**Step 2: Join-to-Create**',
        ...lobbyLines,
        '',
        '-# The LFG role is a notification role. Assign it to members who should receive LFG pings.',
      ].join('\n'))
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(step1ButtonCustomId(state))
          .setLabel('Change Channels')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(STEP2_MANAGE_ID)
          .setLabel('Manage JTC')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(SETUP_REFRESH_ID)
          .setLabel('Run Setup Check')
          .setStyle(ButtonStyle.Secondary)
      )
    );
  if (state.invalidLobbies.length > 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# Warning: ${state.invalidLobbies.length} additional saved lobby configuration(s) need attention.`
      )
    );
  }
  if (state.setupOperation) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '-# Quick Setup still has cleanup or verification work. Open Manage JTC and choose Finish Setup.'
      )
    );
  }
  return buildV2Payload(addNotice(container, notice));
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

function buildStep1Modal(guild, logChannelId, lfgChannelId, configVersion) {
  const validLogId = isAllowedTextChannel(guild.channels.cache.get(logChannelId), guild.id)
    ? logChannelId
    : null;
  const validLfgId = isAllowedTextChannel(guild.channels.cache.get(lfgChannelId), guild.id)
    ? lfgChannelId
    : null;
  return new ModalBuilder()
    .setCustomId(`${STEP1_MODAL_ID}:${configVersion}`)
    .setTitle('Step 1: Message Channels')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('Log channel')
        .setDescription('Where the bot should send logs and status messages.')
        .setChannelSelectMenuComponent(
          buildChannelSelect(
            LOG_CHANNEL_SELECT_ID,
            'Select the Log channel',
            TEXT_CHANNEL_TYPES,
            validLogId
          )
        ),
      new LabelBuilder()
        .setLabel('LFG channel')
        .setDescription('Where the bot should publish LFG messages.')
        .setChannelSelectMenuComponent(
          buildChannelSelect(
            LFG_CHANNEL_SELECT_ID,
            'Select the LFG channel',
            TEXT_CHANNEL_TYPES,
            validLfgId
          )
        )
    );
}

function buildQuickSetupModal() {
  return new ModalBuilder()
    .setCustomId(QUICK_MODAL_ID)
    .setTitle('Quick Setup')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('Voice category')
        .setDescription('The new lobby and temporary voice rooms will use this category.')
        .setChannelSelectMenuComponent(
          buildChannelSelect(
            CATEGORY_SELECT_ID,
            'Select a voice category',
            [ChannelType.GuildCategory],
            null
          )
        )
    );
}

function buildManualSetupModal(guild, channelId, roleId) {
  const validChannelId = guild.channels.cache.get(channelId)?.type === ChannelType.GuildVoice
    ? channelId
    : null;
  const validRoleId = guild.roles.cache.has(roleId) ? roleId : null;
  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId(LOBBY_ROLE_SELECT_ID)
    .setPlaceholder('Select the LFG notification role')
    .setMinValues(1)
    .setMaxValues(1)
    .setRequired(true);
  if (validRoleId) roleSelect.setDefaultRoles(validRoleId);

  return new ModalBuilder()
    .setCustomId(MANUAL_MODAL_ID)
    .setTitle('Manual Join-to-Create Setup')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('Join-to-Create lobby')
        .setDescription('Members joining this voice channel will receive a temporary room.')
        .setChannelSelectMenuComponent(
          buildChannelSelect(
            LOBBY_CHANNEL_SELECT_ID,
            'Select an existing voice channel',
            VOICE_CHANNEL_TYPES,
            validChannelId
          )
        ),
      new LabelBuilder()
        .setLabel('LFG notification role')
        .setDescription('LFG posts from this lobby will mention this role.')
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

async function denySetupAccess(interaction) {
  const content = interaction.guildId
    ? 'Only server Administrators can configure the bot.'
    : 'This command can only be used in a server.';
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
        (lobby) => resolveLobbyState(guild, lobby)
      )),
      configStore.getGuildSetupOperation(guild.id),
    ]);
    const step1Error = logChannel && lfgChannel
      ? validateSelectedChannels(guild, logChannel, lfgChannel)
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
      await interaction.editReply(
        buildErrorPayload('The setup could not be loaded. Please try again.')
      ).catch(() => null);
    }
  }

  async function showSetup(interaction) {
    if (!hasSetupAccess(interaction)) {
      await denySetupAccess(interaction);
      return;
    }
    await interaction.reply(buildLoadingPayload());
    await editLoadedPanel(interaction);
  }

  async function showStep1Modal(interaction) {
    if (!hasSetupAccess(interaction)) {
      await denySetupAccess(interaction);
      return;
    }
    const [, logChannelId, lfgChannelId, configVersion] = interaction.customId.split(':');
    await interaction.showModal(
      buildStep1Modal(interaction.guild, logChannelId, lfgChannelId, configVersion)
    );
  }

  async function saveStep1(interaction) {
    if (!hasSetupAccess(interaction)) {
      await denySetupAccess(interaction);
      return;
    }
    let logChannel;
    let lfgChannel;
    try {
      logChannel = interaction.fields
        .getSelectedChannels(LOG_CHANNEL_SELECT_ID, true, TEXT_CHANNEL_TYPES)
        .first();
      lfgChannel = interaction.fields
        .getSelectedChannels(LFG_CHANNEL_SELECT_ID, true, TEXT_CHANNEL_TYPES)
        .first();
    } catch {
      await interaction.reply({
        content: 'Both channels are required. Open Step 1 and try again.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const validationError = validateSelectedChannels(interaction.guild, logChannel, lfgChannel);
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
        'The channels could not be saved. Please try again.'
      );
      return;
    }
    if (!savedVersion) {
      await editLoadedPanel(
        interaction,
        'step1',
        'The channel setup changed after this form opened. Review the latest settings and try again.'
      );
      return;
    }
    onGuildConfigUpdated(interaction.guildId);
    await editLoadedPanel(interaction, null, 'Step 1 was saved successfully.');
  }

  async function showQuickModal(interaction) {
    if (!hasSetupAccess(interaction)) {
      await denySetupAccess(interaction);
      return;
    }
    await interaction.showModal(buildQuickSetupModal());
  }

  async function runQuickRecovery(interaction) {
    if (!hasSetupAccess(interaction)) {
      await denySetupAccess(interaction);
      return;
    }
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
        'Quick Setup verification and cleanup completed successfully.'
      );
      return;
    }
    if (result.status === 'recovery_complete') {
      await editLoadedPanel(
        interaction,
        null,
        'The unfinished Quick Setup operation was cleaned up. Choose Quick or Manual Setup to continue.'
      );
      return;
    }
    if (result.status === 'in_progress') {
      await editLoadedPanel(
        interaction,
        'step2',
        'Quick Setup is still running. Try Finish Setup again shortly.'
      );
      return;
    }
    if (result.status === 'cleanup_required') {
      await editLoadedPanel(
        interaction,
        'step2',
        `Cleanup is still incomplete. Channel ID: \`${result.operation?.channelId || '-'}\`, role ID: \`${result.operation?.roleId || '-'}\`.`
      );
      return;
    }
    console.error('Quick Setup recovery failed:', result.error, result.cleanupErrors);
    await editLoadedPanel(
      interaction,
      'step2',
      'Quick Setup recovery could not finish. No configured lobby resources were deleted.'
    );
  }

  async function runQuickSetup(interaction) {
    if (!hasSetupAccess(interaction)) {
      await denySetupAccess(interaction);
      return;
    }
    let category;
    try {
      category = interaction.fields
        .getSelectedChannels(CATEGORY_SELECT_ID, true, [ChannelType.GuildCategory])
        .first();
    } catch {
      await interaction.reply({
        content: 'A category is required for Quick Setup.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const permissionError = getQuickSetupPermissionError(interaction.guild, category);
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
        `Created <#${result.channel.id}> and <@&${result.role.id}>. Assign the role to members who should receive LFG notifications.`
      );
      return;
    }
    if (result.status === 'created_cleanup_required') {
      await editLoadedPanel(
        interaction,
        null,
        `Created <#${result.channel.id}> and <@&${result.role.id}>. The main setup is ready, but an extra operation-marked resource could not be cleaned automatically.`
      );
      return;
    }
    if (result.status === 'already_configured') {
      await editLoadedPanel(
        interaction,
        null,
        `Join-to-Create is already configured with <#${result.channel.id}> and <@&${result.role.id}>.`
      );
      return;
    }
    if (result.status === 'saved_needs_attention') {
      await editLoadedPanel(
        interaction,
        'step2',
        'Quick Setup was saved, but the lobby does not currently pass the setup permission checks. Review the listed issue and server permission overwrites.'
      );
      return;
    }
    if (result.status === 'name_conflict') {
      const resources = [
        result.channel ? `<#${result.channel.id}>` : null,
        result.role ? `<@&${result.role.id}>` : null,
      ].filter(Boolean).join(' and ');
      await editLoadedPanel(
        interaction,
        'step2',
        `${resources || 'Matching resources'} already exist but are not configured. Use Manual Setup to connect them.`
      );
      return;
    }
    if (result.status === 'in_progress') {
      await editLoadedPanel(
        interaction,
        'step2',
        'Quick Setup is already running for this server. Try again shortly.'
      );
      return;
    }
    if (result.status === 'configuration_changed') {
      await editLoadedPanel(
        interaction,
        null,
        'The server configuration changed while Quick Setup was opening. The latest setup has been loaded.'
      );
      return;
    }
    if (result.status === 'cleanup_required') {
      await editLoadedPanel(
        interaction,
        'step2',
        `A previous Quick Setup needs manual cleanup. Channel ID: \`${result.operation?.channelId || '-'}\`, role ID: \`${result.operation?.roleId || '-'}\`.`
      );
      return;
    }
    if (result.status === 'verification_required') {
      const retryMessage = result.retryAfterMinutes > 0
        ? `Database verification state could not be saved. Wait up to ${result.retryAfterMinutes} minutes before retrying.`
        : 'Run Quick Setup again to verify the database save.';
      await editLoadedPanel(
        interaction,
        'step2',
        `The Discord resources were kept while the database save is verified. ${retryMessage} Channel ID: \`${result.channelId}\`, role ID: \`${result.roleId}\`.`
      );
      return;
    }
    if (result.status === 'invalid') {
      await editLoadedPanel(interaction, 'step2', result.error);
      return;
    }

    console.error('Quick Setup failed:', result.error, result.cleanupErrors);
    const cleanupNote = result.cleanupErrors?.length
      ? ` Automatic cleanup was incomplete. Channel ID: \`${result.channelId || '-'}\`, role ID: \`${result.roleId || '-'}\`.`
      : '';
    await editLoadedPanel(
      interaction,
      'step2',
      `Quick Setup failed and did not configure the lobby.${cleanupNote}`
    );
  }

  async function showManualModal(interaction) {
    if (!hasSetupAccess(interaction)) {
      await denySetupAccess(interaction);
      return;
    }
    const [, channelId, roleId] = interaction.customId.split(':');
    await interaction.showModal(
      buildManualSetupModal(interaction.guild, channelId, roleId)
    );
  }

  async function saveManualSetup(interaction) {
    if (!hasSetupAccess(interaction)) {
      await denySetupAccess(interaction);
      return;
    }
    let channel;
    let role;
    try {
      channel = interaction.fields
        .getSelectedChannels(LOBBY_CHANNEL_SELECT_ID, true, VOICE_CHANNEL_TYPES)
        .first();
      role = interaction.fields.getSelectedRoles(LOBBY_ROLE_SELECT_ID, true).first();
    } catch {
      await interaction.reply({
        content: 'Both a voice lobby and notification role are required.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const validationError = validateLobby(interaction.guild, channel, role, { manual: true });
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
        `Configured <#${channel.id}> with <@&${role.id}>. Existing lobbies were preserved.`
      );
    } catch (error) {
      console.error('Failed to save Manual Setup:', error);
      await editLoadedPanel(
        interaction,
        'step2',
        error?.code === 'SETUP_RESOURCE_RECOVERY'
          ? 'Quick Setup is still running or recovering. Wait for it to finish, then try Manual Setup again.'
          : 'Manual Setup could not be saved. Please try again.'
      );
    }
  }

  async function refreshView(interaction, preferredView) {
    if (!hasSetupAccess(interaction)) {
      await denySetupAccess(interaction);
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
