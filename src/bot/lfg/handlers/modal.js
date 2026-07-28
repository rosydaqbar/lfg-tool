const { MessageFlags } = require('discord.js');
const {
  CHANNEL_NAME_INPUT_ID,
  CHANNEL_NAME_MODAL_PREFIX,
  CHANNEL_SIZE_INPUT_ID,
  CHANNEL_SIZE_MODAL_PREFIX,
  LFG_MODAL_PREFIX,
  LFG_REMINDER_MODAL_PREFIX,
} = require('../constants');
const { handleLfgPostModal } = require('../lfg-post');

async function handleModalInteraction(interaction, deps) {
  const [prefix, channelId, arg1] = interaction.customId.split(':');
  if (!channelId) return false;

  if (prefix === LFG_REMINDER_MODAL_PREFIX) {
    const guildId = channelId;
    const targetChannelId = arg1;
    if (!guildId || !targetChannelId) return false;
    await handleLfgPostModal(interaction, deps, targetChannelId, { guildId });
    return true;
  }
  const interactionLocale = await deps.getGuildLocale(deps.configStore, interaction.guildId);

  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: deps.t(interactionLocale, 'common.serverOnlyAction'),
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const {
    buildChannelSizeRetryRow,
    getTempVoiceContext,
    isAdminOverride,
    isOwner,
    refreshJoinToCreatePrompt,
  } = deps;

  if (prefix === CHANNEL_NAME_MODAL_PREFIX) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const context = await getTempVoiceContext(interaction.guild, channelId);
    const locale = context.locale || interactionLocale;
    const overrideNotice = (tempInfo) => isAdminOverride?.(tempInfo, interaction.user.id)
      ? deps.t(locale, 'common.override')
      : '';
    if (context.error) {
      await interaction.editReply({ content: context.error });
      return true;
    }
    if (!isOwner(context.tempInfo, interaction.user.id)) {
      await interaction.editReply({
        content: deps.t(locale, 'lfg.ownerOnlySettings'),
      });
      return true;
    }

    const newName = interaction.fields
      .getTextInputValue(CHANNEL_NAME_INPUT_ID)
      .trim();
    if (!newName) {
      await interaction.editReply({ content: deps.t(locale, 'lfg.channelNameEmpty') });
      return true;
    }

    await context.channel.setName(newName, deps.t(locale, 'lfg.renamedBy', { userId: interaction.user.id }));
    await interaction.editReply({
      content: deps.t(locale, 'lfg.channelNameChanged', {
        name: newName,
        notice: overrideNotice(context.tempInfo),
      }),
    });
    await refreshJoinToCreatePrompt(interaction.guild, channelId);
    return true;
  }

  if (prefix === CHANNEL_SIZE_MODAL_PREFIX) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const context = await getTempVoiceContext(interaction.guild, channelId);
    const locale = context.locale || interactionLocale;
    const overrideNotice = (tempInfo) => isAdminOverride?.(tempInfo, interaction.user.id)
      ? deps.t(locale, 'common.override')
      : '';
    if (context.error) {
      await interaction.editReply({ content: context.error });
      return true;
    }
    if (!isOwner(context.tempInfo, interaction.user.id)) {
      await interaction.editReply({
        content: deps.t(locale, 'lfg.ownerOnlySettings'),
      });
      return true;
    }

    const rawLimit = interaction.fields
      .getTextInputValue(CHANNEL_SIZE_INPUT_ID)
      .trim();
    if (!/^\d+$/.test(rawLimit)) {
      await interaction.editReply({
        content: deps.t(locale, 'lfg.numericInput'),
        components: [buildChannelSizeRetryRow(channelId, locale)],
      });
      return true;
    }

    const limit = Number.parseInt(rawLimit, 10);
    if (limit < 0 || limit > 99) {
      await interaction.editReply({
        content: deps.t(locale, 'lfg.memberLimitRange'),
        components: [buildChannelSizeRetryRow(channelId, locale)],
      });
      return true;
    }

    await context.channel.setUserLimit(limit, deps.t(locale, 'lfg.limitSetBy', { userId: interaction.user.id }));
    await interaction.editReply({
      content:
        limit === 0
          ? deps.t(locale, 'lfg.memberLimitUnlimited', { notice: overrideNotice(context.tempInfo) })
          : deps.t(locale, 'lfg.memberLimitChanged', { limit, notice: overrideNotice(context.tempInfo) }),
      components: [],
    });
    await refreshJoinToCreatePrompt(interaction.guild, channelId);
    return true;
  }

  if (prefix !== LFG_MODAL_PREFIX) {
    return false;
  }

  await handleLfgPostModal(interaction, deps, channelId);
  return true;
}

module.exports = { handleModalInteraction };
