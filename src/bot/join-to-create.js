const { ChannelType, OverwriteType } = require('discord.js');

function createJoinToCreateManager({ client, configStore, lfgManager, env }) {
  const joinToCreatePending = new Set();

  function buildChannelName(member, fallbackId) {
    const base =
      member?.displayName || member?.user?.username || `User-${fallbackId}`;
    const trimmed = base.replace(/\s+/g, ' ').trim();
    const name = trimmed || `User-${fallbackId}`;
    return `${name.slice(0, 70)}'s Squad`;
  }

  function getPermissionOverwrites(channel) {
    const guild = channel.guild;
    return channel.permissionOverwrites.cache
      .map((overwrite) => {
        const isRole =
          overwrite.type === OverwriteType.Role || overwrite.type === 'role';
        const isMember =
          overwrite.type === OverwriteType.Member || overwrite.type === 'member';

        if (isRole && !guild?.roles.cache.has(overwrite.id)) {
          return null;
        }
        if (isMember && !guild?.members.cache.has(overwrite.id)) {
          return null;
        }

        return {
          id: overwrite.id,
          allow: overwrite.allow,
          deny: overwrite.deny,
          type: overwrite.type,
        };
      })
      .filter(Boolean);
  }

  async function cleanupTempChannel(oldState) {
    try {
      const oldChannelId = oldState.channelId;
      if (!oldChannelId) return;

      const info = await configStore.getTempChannelInfo(oldChannelId);
      if (!info) return;

      const channel = oldState.channel;
      if (!channel || !channel.isVoiceBased()) {
        await lfgManager.editLfgDisbandedMessage(info);
        await configStore.removeTempChannel(oldChannelId);
        return;
      }

      if (channel.members.size > 0) return;

      let deleted = false;
      try {
        await channel.delete('Join-to-Create temp channel cleanup');
        deleted = true;
      } catch (error) {
        console.error('Failed to delete temp channel:', error);
      }

      if (deleted) {
        await lfgManager.editLfgDisbandedMessage(info);
        await configStore.removeTempChannel(oldChannelId);
      }
    } catch (error) {
      console.error('Failed to cleanup temp channel:', error);
    }
  }

  async function handleJoinToCreate(oldState, newState, config) {
    const guildId = newState.guild?.id;
    const lobbyIds = config.joinToCreateLobbyIds || [];
    const lobbyChannelId = newState.channelId;

    if (!guildId || !lobbyChannelId) return;
    if (oldState.channelId === lobbyChannelId) return;
    if (!lobbyIds.includes(lobbyChannelId)) return;

    const lobbyEntry = (config.joinToCreateLobbies || []).find(
      (entry) => entry.channelId === lobbyChannelId
    );
    const lobbyRoleId = lobbyEntry?.roleId ?? null;
    const lobbyLfgEnabled = lobbyEntry?.lfgEnabled ?? true;
    if (!lobbyRoleId) return;

    const member = newState.member;
    if (!member || member.user?.bot) return;

    const pendingKey = `${guildId}:${member.id}`;
    if (joinToCreatePending.has(pendingKey)) return;
    joinToCreatePending.add(pendingKey);

    try {
      const existingTempId = await configStore.getTempChannelByOwner(
        guildId,
        member.id
      );
      if (existingTempId) {
        const existingChannel = await newState.guild.channels
          .fetch(existingTempId)
          .catch(() => null);
        if (existingChannel && existingChannel.isVoiceBased()) {
          await newState.setChannel(existingChannel);
          return;
        }
        await configStore.removeTempChannel(existingTempId);
      }

      const lobbyChannel = newState.channel;
      if (!lobbyChannel || !lobbyChannel.isVoiceBased()) return;

      const channelName = buildChannelName(member, member.id);
      const channelType =
        lobbyChannel.type === ChannelType.GuildStageVoice
          ? ChannelType.GuildStageVoice
          : ChannelType.GuildVoice;
      const targetPosition =
        typeof lobbyChannel.position === 'number'
          ? lobbyChannel.position + 1
          : null;
      const createdChannel = await newState.guild.channels.create({
        name: channelName,
        type: channelType,
        parent: lobbyChannel.parentId ?? undefined,
        permissionOverwrites: getPermissionOverwrites(lobbyChannel),
        bitrate: lobbyChannel.bitrate,
        userLimit: lobbyChannel.userLimit,
        rtcRegion: lobbyChannel.rtcRegion ?? undefined,
        videoQualityMode: lobbyChannel.videoQualityMode,
      });

      if (typeof targetPosition === 'number') {
        await createdChannel
          .setPosition(targetPosition)
          .catch((error) => {
            console.error('Failed to position temp channel:', error);
          });
      }

      await configStore.addTempChannel(
        guildId,
        createdChannel.id,
        member.id,
        lobbyRoleId,
        lobbyLfgEnabled
      );
      await configStore.upsertVoiceJoin(createdChannel.id, member.id, new Date());
      await newState.setChannel(createdChannel);
      const lfgChannelId =
        config.lfgChannelId || config.logChannelId || env.LOG_CHANNEL_ID;
      await lfgManager.sendJoinToCreatePrompt(
        createdChannel,
        member,
        lfgChannelId,
        lobbyLfgEnabled
      );
    } catch (error) {
      console.error('Failed to create Join-to-Create channel:', error);
    } finally {
      joinToCreatePending.delete(pendingKey);
    }
  }

  return {
    cleanupTempChannel,
    handleJoinToCreate,
  };
}

module.exports = { createJoinToCreateManager };
