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
    isOwner,
    transferChannelOwner,
    userIsInVoiceChannel,
  } = deps;

  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: 'This action can only be used in a server.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const context = await getTempVoiceContext(interaction.guild, channelId);
  if (context.error) {
    await interaction.reply({
      content: context.error,
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (!isOwner(context.tempInfo, interaction.user.id)) {
    await interaction.reply({
      content: 'Hanya owner voice channel yang bisa mengubah setting ini.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (prefix === TRANSFER_SELECT_PREFIX) {
    const newOwnerId = interaction.values[0];
    if (!newOwnerId) {
      await interaction.reply({
        content: 'User transfer tidak valid.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    if (newOwnerId === context.tempInfo.ownerId) {
      await interaction.reply({
        content: 'User tersebut sudah menjadi owner channel ini.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    if (!(await userIsInVoiceChannel(context.channel, newOwnerId))) {
      await interaction.reply({
        content: 'User harus berada di voice channel ini.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    await transferChannelOwner(channelId, newOwnerId);
    await interaction.update({
      content: `Ownership berhasil dipindahkan ke <@${newOwnerId}>.`,
      components: [],
      allowedMentions: { users: [newOwnerId] },
    });
    return true;
  }

  const choice = interaction.values[0];
  if (!choice) {
    await interaction.reply({
      content: 'Region tidak valid.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  let rtcRegion = null;
  if (choice !== 'auto') {
    const fetched = await interaction.guild.fetchVoiceRegions();
    if (!fetched.has(choice)) {
      await interaction.reply({
        content: 'Region tidak tersedia.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    rtcRegion = choice;
  }

  await context.channel.setRTCRegion(
    rtcRegion,
    `Region updated by ${interaction.user.id}`
  );
  await interaction.update({
    content:
      rtcRegion === null
        ? 'Region voice channel diubah ke Automatic.'
        : `Region voice channel diubah ke **${rtcRegion}**.`,
    components: [],
  });
  return true;
}

module.exports = { handleSelectInteraction };
