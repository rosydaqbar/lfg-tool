const { MessageFlags } = require('discord.js');
const {
  CHANNEL_NAME_INPUT_ID,
  CHANNEL_NAME_MODAL_PREFIX,
  CHANNEL_SIZE_INPUT_ID,
  CHANNEL_SIZE_MODAL_PREFIX,
  LFG_MODAL_PREFIX,
} = require('../constants');
const { handleLfgPostModal } = require('../lfg-post');

async function handleModalInteraction(interaction, deps) {
  const [prefix, channelId] = interaction.customId.split(':');
  if (!channelId) return false;

  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: 'This action can only be used in a server.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const {
    buildChannelSizeRetryRow,
    getTempVoiceContext,
    isOwner,
  } = deps;

  if (prefix === CHANNEL_NAME_MODAL_PREFIX) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const context = await getTempVoiceContext(interaction.guild, channelId);
    if (context.error) {
      await interaction.editReply({ content: context.error });
      return true;
    }
    if (!isOwner(context.tempInfo, interaction.user.id)) {
      await interaction.editReply({
        content: 'Hanya owner voice channel yang bisa mengubah setting ini.',
      });
      return true;
    }

    const newName = interaction.fields
      .getTextInputValue(CHANNEL_NAME_INPUT_ID)
      .trim();
    if (!newName) {
      await interaction.editReply({ content: 'Nama channel tidak boleh kosong.' });
      return true;
    }

    await context.channel.setName(newName, `Renamed by ${interaction.user.id}`);
    await interaction.editReply({
      content: `Nama channel berhasil diubah menjadi **${newName}**.`,
    });
    return true;
  }

  if (prefix === CHANNEL_SIZE_MODAL_PREFIX) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const context = await getTempVoiceContext(interaction.guild, channelId);
    if (context.error) {
      await interaction.editReply({ content: context.error });
      return true;
    }
    if (!isOwner(context.tempInfo, interaction.user.id)) {
      await interaction.editReply({
        content: 'Hanya owner voice channel yang bisa mengubah setting ini.',
      });
      return true;
    }

    const rawLimit = interaction.fields
      .getTextInputValue(CHANNEL_SIZE_INPUT_ID)
      .trim();
    if (!/^\d+$/.test(rawLimit)) {
      await interaction.editReply({
        content: 'Input harus berupa angka. Silakan coba lagi.',
        components: [buildChannelSizeRetryRow(channelId)],
      });
      return true;
    }

    const limit = Number.parseInt(rawLimit, 10);
    if (limit < 0 || limit > 99) {
      await interaction.editReply({
        content: 'Batas member harus di antara 0 sampai 99.',
        components: [buildChannelSizeRetryRow(channelId)],
      });
      return true;
    }

    await context.channel.setUserLimit(limit, `User limit set by ${interaction.user.id}`);
    await interaction.editReply({
      content:
        limit === 0
          ? 'Batas member diubah ke unlimited.'
          : `Batas member diubah ke ${limit}.`,
      components: [],
    });
    return true;
  }

  if (prefix !== LFG_MODAL_PREFIX) {
    return false;
  }

  await handleLfgPostModal(interaction, deps, channelId);
  return true;
}

module.exports = { handleModalInteraction };
