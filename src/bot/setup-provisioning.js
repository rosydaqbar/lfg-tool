const { randomUUID } = require('crypto');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { t } = require('../i18n');

const OPERATION_STALE_MS = 15 * 60 * 1000;
const quickSetupLocks = new Set();

function discordErrorCode(error) {
  return error?.code || error?.rawError?.code || null;
}

async function fetchChannelOrNull(guild, channelId) {
  try {
    return await guild.channels.fetch(channelId);
  } catch (error) {
    if (discordErrorCode(error) === 10003) return null;
    throw error;
  }
}

async function fetchRoleOrNull(guild, roleId) {
  try {
    return await guild.roles.fetch(roleId);
  } catch (error) {
    if (discordErrorCode(error) === 10011) return null;
    throw error;
  }
}

async function findValidConfiguredLobby(guild, config) {
  for (const lobby of config.joinToCreateLobbies || []) {
    if (!lobby?.channelId || !lobby?.roleId) continue;
    const [channel, role] = await Promise.all([
      fetchChannelOrNull(guild, lobby.channelId),
      fetchRoleOrNull(guild, lobby.roleId),
    ]);
    const botMember = guild.members.me;
    const channelPermissions = channel && botMember
      ? botMember.permissionsIn(channel)
      : null;
    const operational = Boolean(
      channelPermissions
      && botMember.permissions.has(PermissionFlagsBits.ManageChannels)
      && botMember.permissions.has(PermissionFlagsBits.ManageRoles)
      && botMember.permissions.has(PermissionFlagsBits.MoveMembers)
      && channelPermissions.has(PermissionFlagsBits.ViewChannel)
      && channelPermissions.has(PermissionFlagsBits.ManageChannels)
      && channelPermissions.has(PermissionFlagsBits.Connect)
      && channelPermissions.has(PermissionFlagsBits.MoveMembers)
      && channelPermissions.has(PermissionFlagsBits.SendMessages)
      && channelPermissions.has(PermissionFlagsBits.ReadMessageHistory)
      && (role?.mentionable || botMember.permissions.has(PermissionFlagsBits.MentionEveryone))
    );
    if (
      (channel?.type === ChannelType.GuildVoice || channel?.type === ChannelType.GuildStageVoice)
      && role
      && operational
    ) {
      return { lobby, channel, role };
    }
  }
  return null;
}

function getQuickSetupPermissionError(guild, category, locale = 'en') {
  if (!category || category.guildId !== guild.id || category.type !== ChannelType.GuildCategory) {
    return t(locale, 'setup.selectServerCategory');
  }
  const botMember = guild.members.me;
  if (!botMember) {
    return t(locale, 'setup.permissionCheckFailedRetry');
  }

  const guildRequirements = [
    [PermissionFlagsBits.ManageChannels, t(locale, 'setup.manageChannels')],
    [PermissionFlagsBits.ManageRoles, t(locale, 'setup.manageRoles')],
    [PermissionFlagsBits.MoveMembers, t(locale, 'setup.moveMembers')],
  ];
  const missingGuildPermissions = guildRequirements
    .filter(([permission]) => !botMember.permissions.has(permission))
    .map(([, label]) => label);
  if (missingGuildPermissions.length > 0) {
    return t(locale, 'setup.missingPermissionsServer', { permissions: missingGuildPermissions.join(', ') });
  }

  const categoryRequirements = [
    [PermissionFlagsBits.ViewChannel, t(locale, 'setup.viewChannel')],
    [PermissionFlagsBits.ManageChannels, t(locale, 'setup.manageChannels')],
    [PermissionFlagsBits.Connect, t(locale, 'setup.connect')],
    [PermissionFlagsBits.MoveMembers, t(locale, 'setup.moveMembers')],
    [PermissionFlagsBits.SendMessages, t(locale, 'setup.sendMessages')],
    [PermissionFlagsBits.ReadMessageHistory, t(locale, 'setup.readHistory')],
  ];
  const categoryPermissions = botMember.permissionsIn(category);
  const missingCategoryPermissions = categoryRequirements
    .filter(([permission]) => !categoryPermissions.has(permission))
    .map(([, label]) => label);
  if (missingCategoryPermissions.length > 0) {
    return t(locale, 'setup.missingPermissionsCategory', {
      permissions: missingCategoryPermissions.join(', '),
      category: category.name,
    });
  }
  return null;
}

async function cleanupOperationResources(guild, operation, locale = 'en') {
  const errors = [];
  const channelTargets = new Map();
  const roleTargets = new Map();
  const protectedChannelIds = new Set(operation?.protectedChannelIds || []);
  const protectedRoleIds = new Set(operation?.protectedRoleIds || []);

  if (operation?.channelId) {
    try {
      const channel = await fetchChannelOrNull(guild, operation.channelId);
      if (channel) channelTargets.set(channel.id, channel);
    } catch (error) {
      errors.push(`channel ${operation.channelId}: ${error?.message || error}`);
    }
  }
  if (operation?.roleId) {
    try {
      const role = await fetchRoleOrNull(guild, operation.roleId);
      if (role) roleTargets.set(role.id, role);
    } catch (error) {
      errors.push(`role ${operation.roleId}: ${error?.message || error}`);
    }
  }

  if (operation?.resourceMarker) {
    const marker = operationMarker(operation.resourceMarker);
    const [rolesResult, channelsResult] = await Promise.allSettled([
      guild.roles.fetch(),
      guild.channels.fetch(),
    ]);
    if (rolesResult.status === 'fulfilled') {
      for (const role of rolesResult.value.values()) {
        if (role.name.includes(marker)) roleTargets.set(role.id, role);
      }
    } else {
      errors.push(`role marker scan: ${rolesResult.reason?.message || rolesResult.reason}`);
    }
    if (channelsResult.status === 'fulfilled') {
      for (const channel of channelsResult.value.values()) {
        if (channel?.name?.includes(marker)) channelTargets.set(channel.id, channel);
      }
    } else {
      errors.push(`channel marker scan: ${channelsResult.reason?.message || channelsResult.reason}`);
    }
  }

  for (const [channelId, channel] of channelTargets) {
    if (protectedChannelIds.has(channelId)) continue;
    await channel.delete(t(locale, 'setup.rollbackReason')).catch((error) => {
      errors.push(`channel ${channelId}: ${error?.message || error}`);
    });
  }
  for (const [roleId, role] of roleTargets) {
    if (protectedRoleIds.has(roleId)) continue;
    await role.delete(t(locale, 'setup.rollbackReason')).catch((error) => {
      errors.push(`role ${roleId}: ${error?.message || error}`);
    });
  }
  return errors;
}

function operationMarker(operationId) {
  return `[setup-${operationId.slice(0, 8)}]`;
}

async function findOperationResources(guild, operation) {
  const marker = operationMarker(operation.resourceMarker || operation.operationId);
  const [roles, channels] = await Promise.all([
    guild.roles.fetch(),
    guild.channels.fetch(),
  ]);
  return {
    ...operation,
    roleId: operation.roleId
      || roles.find((role) => role.name.includes(marker))?.id
      || null,
    channelId: operation.channelId
      || channels.find((channel) => channel?.name?.includes(marker))?.id
      || null,
  };
}

function findPersistedLobby(config, channelId, roleId) {
  return (config.joinToCreateLobbies || []).find(
    (lobby) => lobby.channelId === channelId && lobby.roleId === roleId
  ) || null;
}

function protectAdoptedOperationResources(resources, operation) {
  return {
    ...operation,
    protectedChannelIds: resources.channelIds || [],
    protectedRoleIds: resources.roleIds || [],
  };
}

function createQuickSetupProvisioner({ configStore, onGuildConfigUpdated = () => {} }) {
  async function cleanupWithCurrentProtection(guild, operation, locale = 'en') {
    try {
      return await configStore.withGuildSetupResourceProtection(
        guild.id,
        (resources) => cleanupOperationResources(
          guild,
          protectAdoptedOperationResources(resources, operation),
          locale
        )
      );
    } catch (error) {
      return [`cleanup protection: ${error?.message || error}`];
    }
  }

  async function provision(guild, category, { recoveryOnly = false } = {}) {
    if (quickSetupLocks.has(guild.id)) {
      return { status: 'in_progress' };
    }
    quickSetupLocks.add(guild.id);

    let operationId = null;
    let createdRole = null;
    let createdChannel = null;
    let saveAttempted = false;
    let locale = 'en';
    try {
      let config = await configStore.getGuildConfig(guild.id);
      locale = config.locale || 'en';
      const quickLobbyName = t(locale, 'setup.quickLobbyName');
      const quickRoleName = t(locale, 'setup.quickRoleName');
      const quickLobbyNames = new Set([quickLobbyName, t('en', 'setup.quickLobbyName')]);
      const quickRoleNames = new Set([quickRoleName.toLowerCase(), t('en', 'setup.quickRoleName').toLowerCase()]);
      const existingLobby = await findValidConfiguredLobby(guild, config);
      const existingOperation = await configStore.getGuildSetupOperation(guild.id);
      const operationLobby = existingOperation
        ? findPersistedLobby(
          config,
          existingOperation.channelId,
          existingOperation.roleId
        )
        : null;
      if (operationLobby) {
        if (existingOperation.status !== 'cleanup_required') {
          await configStore.updateGuildSetupOperation({
            guildId: guild.id,
            operationId: existingOperation.operationId,
            status: 'cleanup_required',
            roleId: existingOperation.roleId,
            channelId: existingOperation.channelId,
          }).catch(() => null);
        }
      }
      if (existingLobby && !existingOperation) {
        try {
          onGuildConfigUpdated(guild.id);
        } catch (error) {
          console.error('Found an existing Quick Setup lobby but failed to invalidate its config cache:', error);
        }
        return { status: 'already_configured', ...existingLobby };
      }
      if (existingOperation) {
        const updatedAt = new Date(existingOperation.updatedAt || existingOperation.startedAt || 0).getTime();
        const immediatelyRecoverable = Boolean(operationLobby)
          || ['cleanup_required', 'verify_save'].includes(existingOperation.status);
        if (
          !immediatelyRecoverable
          && Number.isFinite(updatedAt)
          && Date.now() - updatedAt < OPERATION_STALE_MS
        ) {
          return { status: 'in_progress' };
        }
        const recoveryOperationId = randomUUID();
        const claimedOperation = await configStore.claimGuildSetupOperationRecovery(
          guild.id,
          existingOperation.operationId,
          recoveryOperationId
        );
        if (!claimedOperation) {
          return { status: 'in_progress' };
        }
        let recoverableOperation;
        try {
          recoverableOperation = await findOperationResources(
            guild,
            claimedOperation
          );
        } catch (error) {
          await configStore.updateGuildSetupOperation({
            guildId: guild.id,
            operationId: recoveryOperationId,
            status: 'cleanup_required',
            roleId: claimedOperation.roleId,
            channelId: claimedOperation.channelId,
          }).catch(() => null);
          return {
            status: 'cleanup_required',
            operation: claimedOperation,
            cleanupErrors: [error?.message || String(error)],
          };
        }
        const recordedRecovery = await configStore.updateGuildSetupOperation({
          guildId: guild.id,
          operationId: recoveryOperationId,
          status: 'recovering',
          roleId: recoverableOperation.roleId,
          channelId: recoverableOperation.channelId,
        });
        if (!recordedRecovery) {
          return { status: 'in_progress' };
        }
        const cleanupErrors = await cleanupWithCurrentProtection(
          guild,
          recoverableOperation,
          locale
        );
        if (cleanupErrors.length > 0) {
          await configStore.updateGuildSetupOperation({
            guildId: guild.id,
            operationId: recoveryOperationId,
            status: 'cleanup_required',
            roleId: recoverableOperation.roleId,
            channelId: recoverableOperation.channelId,
          }).catch(() => null);
          return {
            status: 'cleanup_required',
            operation: recoverableOperation,
            cleanupErrors,
          };
        }
        await configStore.clearGuildSetupOperation(
          guild.id,
          recoveryOperationId
        );
      }

      if (existingLobby) {
        try {
          onGuildConfigUpdated(guild.id);
        } catch (error) {
          console.error('Reconciled Quick Setup but failed to invalidate its config cache:', error);
        }
        return { status: 'already_configured', ...existingLobby };
      }

      if (recoveryOnly) {
        return { status: 'recovery_complete' };
      }

      const permissionError = getQuickSetupPermissionError(guild, category, config.locale);
      if (permissionError) {
        return { status: 'invalid', error: permissionError };
      }

      const [roles, channels] = await Promise.all([
        guild.roles.fetch(),
        guild.channels.fetch(),
      ]);
      const roleConflict = roles.find(
        (role) => quickRoleNames.has(role.name.toLowerCase())
      );
      const channelConflict = channels.find(
        (channel) => channel?.type === ChannelType.GuildVoice
          && quickLobbyNames.has(channel.name)
      );
      if (roleConflict || channelConflict) {
        return {
          status: 'name_conflict',
          role: roleConflict || null,
          channel: channelConflict || null,
        };
      }

      config = await configStore.getGuildConfig(guild.id);
      const recheckedLobby = await findValidConfiguredLobby(guild, config);
      if (recheckedLobby) {
        return { status: 'already_configured', ...recheckedLobby };
      }

      operationId = randomUUID();
      const claim = await configStore.beginGuildSetupOperation(
        guild.id,
        operationId,
        config.configVersion
      );
      if (!claim.acquired) {
        if (claim.configChanged) {
          return { status: 'configuration_changed' };
        }
        return { status: 'in_progress', operation: claim.operation };
      }

      const marker = operationMarker(operationId);
      createdRole = await guild.roles.create({
        name: `${quickRoleName} ${marker}`,
        permissions: 0n,
        hoist: false,
        mentionable: true,
        reason: t(locale, 'setup.quickSetupReason'),
      });
      const recordedRole = await configStore.updateGuildSetupOperation({
        guildId: guild.id,
        operationId,
        status: 'role_created',
        roleId: createdRole.id,
      });
      if (!recordedRole) {
        throw new Error('Quick Setup lost ownership before recording the role.');
      }

      createdChannel = await guild.channels.create({
        name: `${quickLobbyName} ${marker}`,
        type: ChannelType.GuildVoice,
        parent: category.id,
        reason: t(locale, 'setup.quickSetupReason'),
      });
      if (createdChannel.permissionsLocked !== true) {
        await createdChannel.lockPermissions();
      }
      const recordedChannel = await configStore.updateGuildSetupOperation({
        guildId: guild.id,
        operationId,
        status: 'channel_created',
        roleId: createdRole.id,
        channelId: createdChannel.id,
      });
      if (!recordedChannel) {
        throw new Error('Quick Setup lost ownership before recording the channel.');
      }

      await Promise.all([
        createdRole.setName(quickRoleName, t(locale, 'setup.finalizeReason')),
        createdChannel.setName(quickLobbyName, t(locale, 'setup.finalizeReason')),
      ]);

      const markedSaving = await configStore.updateGuildSetupOperation({
        guildId: guild.id,
        operationId,
        status: 'saving',
        roleId: createdRole.id,
        channelId: createdChannel.id,
      });
      if (!markedSaving) {
        throw new Error('Quick Setup lost ownership before saving the lobby.');
      }

      saveAttempted = true;
      const lobby = await configStore.upsertJoinToCreateLobby({
        guildId: guild.id,
        channelId: createdChannel.id,
        roleId: createdRole.id,
        lfgEnabled: true,
        lfgReminderEnabled: false,
        lfgReminderSeconds: 30,
        operationId,
      });
      if (!lobby) {
        throw new Error('Lobby configuration was not returned after saving.');
      }

      const duplicateCleanupErrors = await cleanupWithCurrentProtection(guild, {
        operationId,
        resourceMarker: operationId,
        channelId: null,
        roleId: null,
      }, locale);
      if (duplicateCleanupErrors.length > 0) {
        await configStore.updateGuildSetupOperation({
          guildId: guild.id,
          operationId,
          status: 'cleanup_required',
          roleId: createdRole.id,
          channelId: createdChannel.id,
        }).catch(() => null);
      } else {
        await configStore.clearGuildSetupOperation(guild.id, operationId).catch((error) => {
          console.error('Quick Setup completed but its operation record could not be cleared:', error);
        });
      }
      try {
        onGuildConfigUpdated(guild.id);
      } catch (error) {
        console.error('Quick Setup completed but its config cache could not be invalidated:', error);
      }
      return {
        status: duplicateCleanupErrors.length > 0
          ? 'created_cleanup_required'
          : 'created',
        lobby,
        channel: createdChannel,
        role: createdRole,
        cleanupErrors: duplicateCleanupErrors,
      };
    } catch (error) {
      if (saveAttempted && createdChannel?.id && createdRole?.id) {
        let persistedLobby = null;
        let verificationCompleted = false;
        try {
          const config = await configStore.getGuildConfig(guild.id);
          verificationCompleted = true;
          persistedLobby = findPersistedLobby(
            config,
            createdChannel.id,
            createdRole.id
          );
        } catch (verificationError) {
          console.error('Failed to verify an ambiguous Quick Setup save:', verificationError);
        }
        if (persistedLobby) {
          const duplicateCleanupErrors = await cleanupWithCurrentProtection(guild, {
            operationId,
            resourceMarker: operationId,
            channelId: null,
            roleId: null,
          }, locale);
          if (duplicateCleanupErrors.length > 0) {
            await configStore.updateGuildSetupOperation({
              guildId: guild.id,
              operationId,
              status: 'cleanup_required',
              roleId: createdRole.id,
              channelId: createdChannel.id,
            }).catch(() => null);
          } else {
            await configStore.clearGuildSetupOperation(guild.id, operationId).catch(() => null);
          }
          try {
            onGuildConfigUpdated(guild.id);
          } catch (cacheError) {
            console.error('Verified Quick Setup but failed to invalidate its config cache:', cacheError);
          }
          return {
            status: duplicateCleanupErrors.length > 0
              ? 'created_cleanup_required'
              : 'created',
            lobby: persistedLobby,
            channel: createdChannel,
            role: createdRole,
            cleanupErrors: duplicateCleanupErrors,
          };
        }
        if (!verificationCompleted) {
          const markedForVerification = await configStore.updateGuildSetupOperation({
            guildId: guild.id,
            operationId,
            status: 'verify_save',
            roleId: createdRole.id,
            channelId: createdChannel.id,
          }).catch(() => false);
          return {
            status: 'verification_required',
            error,
            roleId: createdRole.id,
            channelId: createdChannel.id,
            retryAfterMinutes: markedForVerification ? 0 : 15,
          };
        }
      }
      let cleanupTarget = {
        operationId,
        resourceMarker: operationId,
        channelId: createdChannel?.id || null,
        roleId: createdRole?.id || null,
      };
      if (operationId) {
        try {
          const storedOperation = await configStore.getGuildSetupOperation(guild.id);
          if (storedOperation && storedOperation.operationId !== operationId) {
            return {
              status: 'failed',
              error,
              cleanupErrors: ['Quick Setup recovery changed ownership; resources were left for that recovery process.'],
              roleId: createdRole?.id || null,
              channelId: createdChannel?.id || null,
            };
          }
          cleanupTarget = {
            ...cleanupTarget,
            ...storedOperation,
            roleId: createdRole?.id || storedOperation?.roleId || null,
            channelId: createdChannel?.id || storedOperation?.channelId || null,
          };
        } catch (verificationError) {
          await configStore.updateGuildSetupOperation({
            guildId: guild.id,
            operationId,
            status: 'cleanup_required',
            roleId: createdRole?.id || null,
            channelId: createdChannel?.id || null,
          }).catch(() => null);
          return {
            status: 'failed',
            error,
            cleanupErrors: [
              `Could not verify whether setup resources were adopted: ${verificationError?.message || verificationError}`,
            ],
            roleId: createdRole?.id || null,
            channelId: createdChannel?.id || null,
          };
        }
      }
      const cleanupErrors = operationId
        ? await cleanupWithCurrentProtection(guild, cleanupTarget, locale)
        : await cleanupOperationResources(guild, cleanupTarget, locale);
      if (operationId && cleanupErrors.length === 0) {
        await configStore.clearGuildSetupOperation(guild.id, operationId).catch(() => null);
      } else if (operationId) {
        await configStore.updateGuildSetupOperation({
          guildId: guild.id,
          operationId,
          status: 'cleanup_required',
          roleId: createdRole?.id || null,
          channelId: createdChannel?.id || null,
        }).catch(() => null);
      }
      return {
        status: 'failed',
        error,
        cleanupErrors,
        roleId: createdRole?.id || null,
        channelId: createdChannel?.id || null,
      };
    } finally {
      quickSetupLocks.delete(guild.id);
    }
  }

  return { provision };
}

module.exports = {
  createQuickSetupProvisioner,
  findValidConfiguredLobby,
  getQuickSetupPermissionError,
};
