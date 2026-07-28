const {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');
const { getGuildLocale, t } = require('../i18n');

const ADMIN_ID = process.env.ADMIN_DISCORD_USER_ID || null;
const STATS_COMMAND = 'stats';
const VOICECHECK_COMMAND = 'voicecheck';
const VOICECHECK_DELETE_PREFIX = 'voicecheck_delete';

function formatDuration(totalMs, locale = 'en') {
  const safeMs = Math.max(0, Number(totalMs) || 0);
  const totalMinutes = Math.floor(safeMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return t(locale, 'common.durationMinutes', { minutes });
  return t(locale, 'common.durationHoursMinutes', { hours, minutes });
}

function buildStatsCommand() {
  return new SlashCommandBuilder()
    .setName(STATS_COMMAND)
    .setDescription(t('en', 'stats.commandDescription'))
    .setDescriptionLocalizations({ id: t('id', 'stats.commandDescription') })
    .addSubcommand((subcommand) =>
      subcommand
        .setName('me')
        .setDescription(t('en', 'stats.meDescription'))
        .setDescriptionLocalizations({ id: t('id', 'stats.meDescription') })
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('user')
        .setDescription(t('en', 'stats.userDescription'))
        .setDescriptionLocalizations({ id: t('id', 'stats.userDescription') })
        .addUserOption((option) =>
          option
            .setName('target')
            .setDescription(t('en', 'stats.targetDescription'))
            .setDescriptionLocalizations({ id: t('id', 'stats.targetDescription') })
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('leaderboard')
        .setDescription(t('en', 'stats.leaderboardDescription'))
        .setDescriptionLocalizations({ id: t('id', 'stats.leaderboardDescription') })
    )
    .toJSON();
}

function buildVoicecheckCommand() {
  return new SlashCommandBuilder()
    .setName(VOICECHECK_COMMAND)
    .setDescription(t('en', 'stats.voicecheckDescription'))
    .setDescriptionLocalizations({ id: t('id', 'stats.voicecheckDescription') })
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON();
}

function isVoicecheckAllowed(interaction) {
  return Boolean(
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
  );
}

async function getVoicecheckSnapshot(configStore, guild) {
  const rows = await configStore.getTempChannelsForGuild(guild.id);
  const fetched = await guild.channels.fetch();
  const channelsById = new Map();
  for (const [id, channel] of fetched) {
    if (!channel) continue;
    channelsById.set(id, channel);
  }

  return rows.map((row) => {
    const channel = channelsById.get(row.channel_id) || null;
    if (!channel || !channel.isVoiceBased()) {
      return {
        channelId: row.channel_id,
        ownerId: row.owner_id,
        createdAt: row.created_at,
        state: 'not_found',
        activeCount: 0,
      };
    }

    const activeCount = channel.members?.filter((member) => !member.user?.bot).size || 0;
    if (activeCount <= 0) {
      return {
        channelId: row.channel_id,
        ownerId: row.owner_id,
        createdAt: row.created_at,
        state: 'empty',
        activeCount,
      };
    }

    return {
      channelId: row.channel_id,
      ownerId: row.owner_id,
      createdAt: row.created_at,
      state: 'active',
      activeCount,
    };
  });
}

function buildVoicecheckPayload(rows, locale = 'en') {
  const now = Date.now();
  const total = rows.length;
  const notFound = rows.filter((row) => row.state === 'not_found').length;
  const empty = rows.filter((row) => row.state === 'empty').length;
  const active = rows.filter((row) => row.state === 'active').length;

  const rowComponents = rows.slice(0, 20).map((row) => {
    const createdMs = new Date(row.createdAt).getTime();
    const ageMinutes = Number.isFinite(createdMs)
      ? Math.max(0, Math.floor((now - createdMs) / 60000))
      : null;
    const stateLabel =
      row.state === 'not_found'
        ? t(locale, 'stats.notFound')
        : row.state === 'empty'
          ? t(locale, 'stats.empty')
          : `${t(locale, 'stats.active')} (${row.activeCount})`;
    const canDelete = row.state === 'not_found' || row.state === 'empty';

    return {
      type: 9,
      components: [
        {
          type: 10,
          content:
            `**<#${row.channelId}>**\n` +
            `- ${t(locale, 'stats.status')}: \`${stateLabel}\`\n` +
            `- ${t(locale, 'stats.owner')}: <@${row.ownerId}>\n` +
            `- ${t(locale, 'stats.age')}: ${ageMinutes === null ? '-' : `\`${t(locale, 'common.durationMinutes', { minutes: ageMinutes })}\``}`,
        },
      ],
      accessory: {
        type: 2,
        style: canDelete ? 4 : 2,
        label: t(locale, 'stats.delete'),
        custom_id: `${VOICECHECK_DELETE_PREFIX}:${row.channelId}`,
        disabled: !canDelete,
      },
    };
  });

  return {
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    components: [
      {
        type: 17,
        accent_color: 0x0ea5e9,
        components: [
          {
            type: 10,
            content:
              `${t(locale, 'stats.voicecheckTitle')}\n` +
              `${t(locale, 'stats.voicecheckHelp')}\n\n` +
              `${t(locale, 'stats.summary')} • ${t(locale, 'stats.total')}: \`${total}\` • ${t(locale, 'stats.active')}: \`${active}\` • ${t(locale, 'stats.empty')}: \`${empty}\` • ${t(locale, 'stats.notFound')}: \`${notFound}\``,
          },
          { type: 14, divider: true, spacing: 1 },
          ...(rowComponents.length
            ? rowComponents
            : [
                {
                  type: 10,
                  content: t(locale, 'stats.noTempChannels'),
                },
              ]),
          ...(rows.length > 20
            ? [
                { type: 14, divider: true, spacing: 1 },
                {
                  type: 10,
                  content: t(locale, 'stats.showingChannels', { count: rows.length }),
                },
              ]
            : []),
        ],
      },
    ],
    allowedMentions: { parse: [] },
  };
}

function buildStatsContainerPayload({
  title,
  introParagraph = null,
  lines,
  avatarUrl,
  accentColor = 0x3b82f6,
  mentionUserId = null,
  ephemeral = true,
  locale = 'en',
}) {
  const flags = ephemeral
    ? MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
    : MessageFlags.IsComponentsV2;

  return {
    flags,
    components: [
      {
        type: 17,
        accent_color: accentColor,
        components: [
          {
            type: 9,
            components: introParagraph
              ? [
                  {
                    type: 10,
                    content: `${title}\n${introParagraph}`,
                  },
                ]
              : [
                  {
                    type: 10,
                    content: title,
                  },
                ],
            accessory: {
              type: 11,
              media: {
                url: avatarUrl,
              },
               description: t(locale, 'stats.userAvatar'),
            },
          },
          {
            type: 14,
            divider: true,
            spacing: 1,
          },
          {
            type: 10,
            content: lines.join('\n'),
          },
        ],
      },
    ],
    allowedMentions: mentionUserId
      ? { users: [mentionUserId] }
      : { parse: [] },
  };
}

async function buildUserStatsReplyPayload({
  configStore,
  guildId,
  targetUser,
  ephemeral = true,
  locale = 'en',
}) {
  const stats = await configStore.getVoiceStatsForUser(guildId, targetUser.id);
  const nowMs = Date.now();
  const activeMs = stats.activeNow?.joinedAt
    ? nowMs - stats.activeNow.joinedAt.getTime()
    : 0;
  const currentSessionMs =
    (stats.activeNow?.previousTotalMs || 0) + Math.max(0, activeMs);

  const averageMs =
    stats.sessions > 0 ? Math.floor(stats.totalMs / stats.sessions) : 0;

  const summaryParagraph = t(locale, 'stats.userSummary', {
    userId: targetUser.id,
    total: formatDuration(stats.totalMs, locale),
    sessions: stats.sessions,
    average: formatDuration(averageMs, locale),
    longest: formatDuration(stats.longestMs, locale),
  });

  const activeStatus = stats.activeNow
    ? t(locale, 'stats.activeNow', { duration: formatDuration(currentSessionMs, locale) })
    : t(locale, 'stats.inactive');

  const lines = [
    t(locale, 'stats.moreDetails'),
    t(locale, 'stats.ownerCount', { count: stats.ownerCount }),
    t(locale, 'stats.serverRank', { rank: stats.rank ?? '-' }),
    t(locale, 'stats.voiceStatus', { status: activeStatus }),
  ];

  const avatarUrl = targetUser.displayAvatarURL({
    extension: 'png',
    size: 128,
    forceStatic: true,
  });

  return buildStatsContainerPayload({
    title: t(locale, 'stats.voiceStatsTitle'),
    introParagraph: summaryParagraph,
    lines,
    avatarUrl,
    accentColor: 0x2563eb,
    mentionUserId: targetUser.id,
    ephemeral,
    locale,
  });
}

function createStatsManager({ client, configStore }) {
  async function deleteReminderDm(info) {
    if (!info?.ownerId || !info?.reminderDmMessageId) return;
    try {
      const user = await client.users.fetch(info.ownerId).catch(() => null);
      const dmChannel = await user?.createDM().catch(() => null);
      const message = await dmChannel?.messages
        .fetch(info.reminderDmMessageId)
        .catch(() => null);
      await message?.delete().catch((error) => {
        const rawCode = error?.code || error?.rawError?.code || error?.data?.code || null;
        if (rawCode === 10008) return;
        throw error;
      });
    } catch (error) {
      console.error('Failed to delete LFG reminder DM from voicecheck cleanup:', error);
    }
  }

  async function replyVoicecheck(interaction) {
    const locale = await getGuildLocale(configStore, interaction.guildId);
    if (!interaction.guildId || !interaction.guild) {
      await interaction.reply({
        content: t(locale, 'common.serverOnlyCommand'),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!isVoicecheckAllowed(interaction)) {
      await interaction.reply({
        content: t(locale, 'common.adminOnlyCommand'),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const rows = await getVoicecheckSnapshot(configStore, interaction.guild);
    await interaction.reply(buildVoicecheckPayload(rows, locale));
  }

  async function handleVoicecheckDelete(interaction) {
    const locale = await getGuildLocale(configStore, interaction.guildId);
    if (!interaction.guildId || !interaction.guild) {
      await interaction.reply({
        content: t(locale, 'common.serverOnlyAction'),
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (!isVoicecheckAllowed(interaction)) {
      await interaction.reply({
        content: t(locale, 'common.adminOnlyAction'),
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const [, channelId] = interaction.customId.split(':');
    if (!channelId) {
      await interaction.reply({
        content: t(locale, 'stats.invalidChannelId'),
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    await interaction.deferUpdate();

    try {
      const rows = await getVoicecheckSnapshot(configStore, interaction.guild);
      const row = rows.find((item) => item.channelId === channelId);
      if (!row) {
        await interaction.followUp({
          content: t(locale, 'stats.missingRecord'),
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }

      if (row.state === 'active') {
        await interaction.followUp({
          content: t(locale, 'stats.activeCannotDelete'),
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }

      const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
      if (channel && channel.isVoiceBased()) {
        const humanCount = channel.members?.filter((member) => !member.user?.bot).size || 0;
        if (humanCount > 0) {
          await interaction.followUp({
            content: t(locale, 'stats.activeUsersRemain'),
            flags: MessageFlags.Ephemeral,
          });
          return true;
        }

        await channel
          .delete(t(locale, 'stats.cleanupReason', { userId: interaction.user.id }))
          .catch((error) => {
            const rawCode =
              error?.code
              || error?.rawError?.code
              || error?.data?.code
              || null;
            if (rawCode === 10003) {
              return;
            }
            console.error('Failed to delete Discord voice channel from voicecheck:', error);
            throw error;
          });
      }

      const info = await configStore.getTempChannelInfo(channelId).catch(() => null);
      await deleteReminderDm(info);
      await configStore.removeTempChannel(channelId);

      const refreshed = await getVoicecheckSnapshot(configStore, interaction.guild);
      await interaction.editReply(buildVoicecheckPayload(refreshed, locale));
      await interaction.followUp({
        content: t(locale, 'stats.cleanupSuccess', { channelId }),
        flags: MessageFlags.Ephemeral,
      });
      return true;
    } catch (error) {
      console.error('Voicecheck delete failed:', error);
      await interaction.followUp({
        content: t(locale, 'stats.cleanupFailed'),
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
      return true;
    }
  }

  async function replyStats(interaction, targetUser, options = {}) {
    const guildId = interaction.guildId;
    const locale = await getGuildLocale(configStore, guildId);
    if (!guildId) {
      await interaction.reply({
        content: t(locale, 'common.serverOnlyCommand'),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply(
      await buildUserStatsReplyPayload({
        configStore,
        guildId,
        targetUser,
        ephemeral: options.ephemeral ?? true,
        locale,
      })
    );
  }

  async function replyMyStats(interaction, options = {}) {
    await replyStats(interaction, interaction.user, options);
  }

  async function replyLeaderboard(interaction, options = {}) {
    const guildId = interaction.guildId;
    const locale = await getGuildLocale(configStore, guildId);
    if (!guildId) {
      await interaction.reply({
        content: t(locale, 'common.serverOnlyCommand'),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const rows = await configStore.getVoiceLeaderboard(guildId, 10);
    if (!rows.length) {
      const payload = {
        content: t(locale, 'stats.noLeaderboard'),
      };
      if (options.ephemeral !== false) {
        payload.flags = MessageFlags.Ephemeral;
      }
      await interaction.reply(payload);
      return;
    }

    const lines = [];
    for (const row of rows) {
      lines.push(
        `${row.rank}. <@${row.userId}> • \`${formatDuration(row.totalMs, locale)}\` • ${t(locale, 'stats.sessions', { count: row.sessions })}`
      );
    }

    const totalDurationMs = rows.reduce(
      (sum, row) => sum + Math.max(0, Number(row.totalMs) || 0),
      0
    );
    const totalSessions = rows.reduce(
      (sum, row) => sum + Math.max(0, Number(row.sessions) || 0),
      0
    );
    const topUser = rows[0];
    const summaryParagraph = t(locale, 'stats.leaderboardSummary', {
      count: rows.length,
      total: formatDuration(totalDurationMs, locale),
      sessions: totalSessions,
      userId: topUser.userId,
      userTotal: formatDuration(topUser.totalMs, locale),
    });

    const avatarUrl = interaction.user.displayAvatarURL({
      extension: 'png',
      size: 128,
      forceStatic: true,
    });

    await interaction.reply(
      buildStatsContainerPayload({
        title: t(locale, 'stats.voiceLeaderboardTitle'),
        introParagraph: summaryParagraph,
        lines,
        avatarUrl,
        accentColor: 0xf59e0b,
        ephemeral: options.ephemeral ?? false,
        locale,
      })
    );
  }

  async function handleInteraction(interaction) {
    if (interaction.isButton()) {
      if (!interaction.customId.startsWith(`${VOICECHECK_DELETE_PREFIX}:`)) {
        return false;
      }
      return handleVoicecheckDelete(interaction);
    }

    if (!interaction.isChatInputCommand()) return false;

    if (interaction.commandName === VOICECHECK_COMMAND) {
      await replyVoicecheck(interaction);
      return true;
    }

    if (interaction.commandName !== STATS_COMMAND) return false;

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'me') {
      await replyMyStats(interaction);
      return true;
    }

    if (subcommand === 'user') {
      if (!ADMIN_ID || interaction.user.id !== ADMIN_ID) {
        const locale = await getGuildLocale(configStore, interaction.guildId);
        await interaction.reply({
          content: t(locale, 'stats.adminSubcommand'),
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }
      const target = interaction.options.getUser('target', true);
      await replyStats(interaction, target);
      return true;
    }

    if (subcommand === 'leaderboard') {
      await replyLeaderboard(interaction);
      return true;
    }

    const locale = await getGuildLocale(configStore, interaction.guildId);
    await interaction.reply({
      content: t(locale, 'stats.unknownSubcommand'),
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  return {
    handleInteraction,
    replyLeaderboard,
    replyMyStats,
  };
}

module.exports = {
  createStatsManager,
  buildStatsCommand,
  buildVoicecheckCommand,
};
