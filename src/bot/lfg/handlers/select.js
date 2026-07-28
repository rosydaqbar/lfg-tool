const { MessageFlags } = require('discord.js');
const {
  REGION_SELECT_PREFIX,
  TRANSFER_SELECT_PREFIX,
} = require('../constants');

async function handleSelectInteraction(interaction, deps) {
  const [prefix, channelId] = interaction.customId.split(':');
  if (!prefix || !channelId) return false;
  if (prefix !== TRANSFER_SELECT_PREFIX && prefix !== REGION_SELECT_PREFIX) {
    return false;
  }

  const {
    getTempVoiceContext,
    isAdminOverride,
    isOwner,
    refreshJoinToCreatePrompt,
    transferChannelOwner,
    userIsInVoiceChannel,
  } = deps;
  const locale = await deps.getGuildLocale(deps.configStore, interaction.guildId);

  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: deps.t(locale, 'common.serverOnlyAction'),
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const context = await getTempVoiceContext(interaction.guild, channelId);
  const currentLocale = context.locale || locale;
  function overrideNotice(tempInfo) {
    return isAdminOverride?.(tempInfo, interaction.user.id)
      ? deps.t(currentLocale, 'common.override')
      : '';
  }
  if (context.error) {
    await interaction.reply({
      content: context.error,
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (!isOwner(context.tempInfo, interaction.user.id)) {
    await interaction.reply({
      content: deps.t(currentLocale, 'lfg.ownerOnlySettings'),
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (prefix === TRANSFER_SELECT_PREFIX) {
    const newOwnerId = interaction.values[0];
    if (!newOwnerId) {
      await interaction.reply({
        content: deps.t(currentLocale, 'lfg.invalidTransferUser'),
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    if (newOwnerId === context.tempInfo.ownerId) {
      await interaction.reply({
        content: deps.t(currentLocale, 'lfg.userAlreadyOwner'),
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    if (!(await userIsInVoiceChannel(context.channel, newOwnerId))) {
      await interaction.reply({
        content: deps.t(currentLocale, 'lfg.transferUserMustJoin'),
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    await transferChannelOwner(channelId, newOwnerId);
    await interaction.update({
      content: deps.t(currentLocale, 'lfg.ownershipTransferred', {
        userId: newOwnerId,
        notice: overrideNotice(context.tempInfo),
      }),
      components: [],
      allowedMentions: { users: [newOwnerId] },
    });
    await refreshJoinToCreatePrompt(interaction.guild, channelId);
    return true;
  }

  const choice = interaction.values[0];
  if (!choice) {
    await interaction.reply({
      content: deps.t(currentLocale, 'lfg.invalidRegion'),
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  let rtcRegion = null;
  if (choice !== 'auto') {
    const fetched = await deps.client.fetchVoiceRegions();
    if (!fetched.has(choice)) {
      await interaction.reply({
        content: deps.t(currentLocale, 'lfg.regionUnavailable'),
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    rtcRegion = choice;
  }

  await context.channel.setRTCRegion(
    rtcRegion,
    deps.t(currentLocale, 'lfg.regionUpdatedBy', { userId: interaction.user.id })
  );
  await interaction.update({
    content:
      rtcRegion === null
        ? deps.t(currentLocale, 'lfg.regionChangedAutomatic', { notice: overrideNotice(context.tempInfo) })
        : deps.t(currentLocale, 'lfg.regionChanged', { region: rtcRegion, notice: overrideNotice(context.tempInfo) }),
    components: [],
  });
  await refreshJoinToCreatePrompt(interaction.guild, channelId);
  return true;
}

module.exports = { handleSelectInteraction };
