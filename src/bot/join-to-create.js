const { ChannelType, MessageFlags, OverwriteType } = require('discord.js');

function createJoinToCreateManager({ client, configStore, lfgManager, env, debugLog }) {
  const joinToCreatePending = new Set();
  const joinToCreateCooldown = new Map();
  const cleanupInProgress = new Set();
  const recentDeletionLog = new Map();
  const JTC_COOLDOWN_MS = 1500;
  const DELETE_LOG_DEDUPE_MS = 30_000;

  function pruneRecentDeletionLog() {
    if (recentDeletionLog.size < 500) return;
    const cutoff = Date.now() - (DELETE_LOG_DEDUPE_MS * 4);
    for (const [key, value] of recentDeletionLog.entries()) {
      if (value < cutoff) {
        recentDeletionLog.delete(key);
      }
    }
  }

  function debugTiming(stage, data) {
    if (typeof debugLog === 'function') {
      debugLog(stage, data);
    }
  }

  function formatDuration(totalMs) {
    const safeMs = Math.max(0, Number(totalMs) || 0);
    const totalMinutes = Math.floor(safeMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours <= 0) return `${minutes}m`;
    return `${hours}h ${minutes}m`;
  }

  async function getDeletionLogChannelId(guildId) {
    if (env.LOG_CHANNEL_ID) return env.LOG_CHANNEL_ID;
    if (!guildId) return null;
    const config = await configStore.getGuildConfig(guildId).catch(() => null);
    return config?.logChannelId || null;
  }

  async function sendTempChannelDeletedLog({
    guildId,
    channelId,
    channelName,
    ownerId,
  }) {
    const dedupeKey = `${guildId || '-'}:${channelId}`;
    const recentAt = recentDeletionLog.get(dedupeKey) || 0;
    if (Date.now() - recentAt < DELETE_LOG_DEDUPE_MS) {
      return;
    }
    recentDeletionLog.set(dedupeKey, Date.now());
    pruneRecentDeletionLog();

    await configStore
      .finalizeVoiceActivity(channelId, new Date())
      .catch((error) => {
        console.error('Failed to finalize voice activity before deletion log:', error);
      });

    const activityRows = await configStore.getVoiceActivity(channelId).catch(() => []);
    const historyRows = activityRows
      .filter((row) => !row.isActive)
      .sort((a, b) => (b.updatedAt?.getTime() || 0) - (a.updatedAt?.getTime() || 0));

    const historySnapshot = historyRows.map((row) => ({
      userId: row.userId,
      totalMs: Math.max(0, Number(row.totalMs) || 0),
    }));

    if (guildId && ownerId) {
      await configStore
        .addTempVoiceDeleteLog({
          guildId,
          channelId,
          channelName,
          ownerId,
          history: historySnapshot,
          deletedAt: new Date(),
        })
        .catch((error) => {
          console.error('Failed to persist temp channel deletion log:', error);
        });
    }

    const logChannelId = await getDeletionLogChannelId(guildId);
    if (!logChannelId) return;

    const logChannel = await client.channels.fetch(logChannelId).catch(() => null);
    if (!logChannel || !logChannel.isTextBased()) return;

    const historyLines = historyRows.length
      ? historyRows.slice(0, 20).map(
        (row) => `- <@${row.userId}> • total: \`${formatDuration(row.totalMs)}\``
      )
      : ['- Tidak ada riwayat user'];

    if (historyRows.length > 20) {
      historyLines.push(`- ...dan ${historyRows.length - 20} lainnya`);
    }

    const detailLines = [
      `- Channel: ${channelName ? `\`${channelName}\`` : '(unknown)'} (\`${channelId}\`)`,
      `- Owner: <@${ownerId}>`,
      `- Deleted: <t:${Math.floor(Date.now() / 1000)}:F>`,
      '',
      '**History**',
      ...historyLines,
    ];

    await logChannel.send({
      flags: MessageFlags.IsComponentsV2,
      components: [
        {
          type: 17,
          accent_color: 0xef4444,
          components: [
            {
              type: 10,
              content: '### Temp Voice Channel Deleted',
            },
            {
              type: 14,
              divider: true,
              spacing: 1,
            },
            {
              type: 10,
              content: detailLines.join('\n'),
            },
          ],
        },
      ],
      allowedMentions: { parse: [] },
    }).catch((error) => {
      console.error('Failed to send temp channel deletion log:', error);
    });
  }

  async function sendJoinToCreateErrorLog({ guildId, memberId, lobbyChannelId, error, config }) {
    const logChannelId = config?.logChannelId || env.LOG_CHANNEL_ID;
    if (!logChannelId) return;

    const logChannel = await client.channels.fetch(logChannelId).catch(() => null);
    if (!logChannel || !logChannel.isTextBased()) return;

    const errorCode = error?.code ? ` (${error.code})` : '';
    const errorMessage = error?.message || 'Unknown error';
    const missingPermHint = error?.code === 50013
      ? '\nHint: Give bot permission to Manage Channels and Connect in this category.'
      : '';

    const content = [
      '### Join-to-Create Error',
      `- Guild: \`${guildId || '-'}\``,
      `- Lobby Channel: <#${lobbyChannelId}> (\`${lobbyChannelId}\`)`,
      `- User: <@${memberId}> (\`${memberId}\`)`,
      `- Error: \`${errorMessage}${errorCode}\`${missingPermHint}`,
    ].join('\n');

    await logChannel.send({
      content,
      allowedMentions: { parse: [] },
    }).catch((sendError) => {
      console.error('Failed to send Join-to-Create error log:', sendError);
    });
  }

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

      if (cleanupInProgress.has(oldChannelId)) return;
      cleanupInProgress.add(oldChannelId);

      const info = await configStore.getTempChannelInfo(oldChannelId);
      if (!info) return;

      const channel = oldState.channel;
      if (!channel || !channel.isVoiceBased()) {
        await sendTempChannelDeletedLog({
          guildId: oldState.guild?.id,
          channelId: oldChannelId,
          channelName: oldState.channel?.name ?? null,
          ownerId: info.ownerId,
        });
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
        await sendTempChannelDeletedLog({
          guildId: oldState.guild?.id,
          channelId: oldChannelId,
          channelName: channel.name,
          ownerId: info.ownerId,
        });
        await lfgManager.editLfgDisbandedMessage(info);
        await configStore.removeTempChannel(oldChannelId);
      }
    } catch (error) {
      console.error('Failed to cleanup temp channel:', error);
    } finally {
      const oldChannelId = oldState.channelId;
      if (oldChannelId) {
        cleanupInProgress.delete(oldChannelId);
      }
    }
  }

  async function handleJoinToCreate(oldState, newState, config) {
    const startedAtMs = Date.now();
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
    const cooldownUntil = joinToCreateCooldown.get(pendingKey) || 0;
    if (cooldownUntil > Date.now()) return;
    if (cooldownUntil) {
      joinToCreateCooldown.delete(pendingKey);
    }
    if (joinToCreatePending.has(pendingKey)) return;
    joinToCreatePending.add(pendingKey);

    try {
      const lookupStartedAt = Date.now();
      const existingTempId = await configStore.getTempChannelByOwner(
        guildId,
        member.id
      );
      debugTiming('jtc.lookup_existing_owner_temp', {
        guildId,
        memberId: member.id,
        existingTempId,
        ms: Date.now() - lookupStartedAt,
      });

      if (existingTempId) {
        const existingFetchStartedAt = Date.now();
        const existingChannel = await newState.guild.channels
          .fetch(existingTempId)
          .catch(() => null);
        debugTiming('jtc.fetch_existing_temp_channel', {
          guildId,
          memberId: member.id,
          existingTempId,
          found: Boolean(existingChannel),
          ms: Date.now() - existingFetchStartedAt,
        });
        if (existingChannel && existingChannel.isVoiceBased()) {
          const reuseMoveStartedAt = Date.now();
          await newState.setChannel(existingChannel);
          joinToCreateCooldown.set(pendingKey, Date.now() + JTC_COOLDOWN_MS);
          debugTiming('jtc.reuse_existing_temp_channel_moved', {
            guildId,
            memberId: member.id,
            channelId: existingChannel.id,
            ms: Date.now() - reuseMoveStartedAt,
            totalMs: Date.now() - startedAtMs,
          });
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

      const createStartedAt = Date.now();
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
      debugTiming('jtc.created_temp_channel', {
        guildId,
        memberId: member.id,
        lobbyChannelId,
        createdChannelId: createdChannel.id,
        ms: Date.now() - createStartedAt,
      });

      const dbCreateStartedAt = Date.now();
      await configStore.addTempChannel(
        guildId,
        createdChannel.id,
        member.id,
        lobbyRoleId,
        lobbyLfgEnabled
      );

      debugTiming('jtc.persist_temp_channel', {
        guildId,
        memberId: member.id,
        createdChannelId: createdChannel.id,
        ms: Date.now() - dbCreateStartedAt,
      });

      const moveStartedAt = Date.now();
      await newState.setChannel(createdChannel);
      joinToCreateCooldown.set(pendingKey, Date.now() + JTC_COOLDOWN_MS);
      debugTiming('jtc.moved_member_to_temp', {
        guildId,
        memberId: member.id,
        createdChannelId: createdChannel.id,
        ms: Date.now() - moveStartedAt,
      });

      const lfgChannelId =
        config.lfgChannelId || config.logChannelId || env.LOG_CHANNEL_ID;

      const postMoveStartedAt = Date.now();
      const postMoveTasks = [
        configStore
          .upsertVoiceJoin(createdChannel.id, member.id, new Date())
          .catch((error) => {
            console.error('Failed to mark voice join for new temp channel:', error);
          }),
        lfgManager
          .sendJoinToCreatePrompt(
            createdChannel,
            member,
            lfgChannelId,
            lobbyLfgEnabled
          )
          .catch((error) => {
            console.error('Failed to send Join-to-Create prompt:', error);
          }),
      ];

      if (typeof targetPosition === 'number') {
        postMoveTasks.push(
          createdChannel
            .setPosition(targetPosition)
            .catch((error) => {
              console.error('Failed to position temp channel:', error);
            })
        );
      }

      await Promise.all(postMoveTasks);

      debugTiming('jtc.post_move_tasks_complete', {
        guildId,
        memberId: member.id,
        createdChannelId: createdChannel.id,
        ms: Date.now() - postMoveStartedAt,
        totalMs: Date.now() - startedAtMs,
      });
    } catch (error) {
      console.error('Failed to create Join-to-Create channel:', error);
      await sendJoinToCreateErrorLog({
        guildId,
        memberId: member.id,
        lobbyChannelId,
        error,
        config,
      });
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
