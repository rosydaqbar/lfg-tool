const {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');

const ADMIN_ID = process.env.ADMIN_DISCORD_USER_ID || null;
const STATS_COMMAND = 'stats';
const VOICECHECK_COMMAND = 'voicecheck';
const VOICECHECK_DELETE_PREFIX = 'voicecheck_delete';

function formatDuration(totalMs) {
  const safeMs = Math.max(0, Number(totalMs) || 0);
  const totalMinutes = Math.floor(safeMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function buildStatsCommand() {
  return new SlashCommandBuilder()
    .setName(STATS_COMMAND)
    .setDescription('Lihat statistik voice temp channel')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('me')
        .setDescription('Lihat statistik akun kamu')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('user')
        .setDescription('Lihat statistik user tertentu (admin only)')
        .addUserOption((option) =>
          option
            .setName('target')
            .setDescription('User yang ingin dilihat statistiknya')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('leaderboard')
        .setDescription('Top 10 total durasi voice')
    )
    .toJSON();
}

function buildVoicecheckCommand() {
  return new SlashCommandBuilder()
    .setName(VOICECHECK_COMMAND)
    .setDescription('Cek temp voice channel kosong / tidak ditemukan')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .toJSON();
}

function isVoicecheckAllowed(interaction) {
  if (ADMIN_ID && interaction.user.id === ADMIN_ID) return true;
  return Boolean(
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)
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

    const activeCount = channel.members?.size || 0;
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

function buildVoicecheckPayload(rows) {
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
        ? 'Not found'
        : row.state === 'empty'
          ? 'Empty'
          : `Active (${row.activeCount})`;
    const canDelete = row.state === 'not_found' || row.state === 'empty';

    return {
      type: 9,
      components: [
        {
          type: 10,
          content:
            `**<#${row.channelId}>**\n` +
            `- Status: \`${stateLabel}\`\n` +
            `- Owner: <@${row.ownerId}>\n` +
            `- Umur: ${ageMinutes === null ? '-' : `\`${ageMinutes}m\``}`,
        },
      ],
      accessory: {
        type: 2,
        style: canDelete ? 4 : 2,
        label: 'Delete',
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
              '### Voice Check\n' +
              `-# Track temp channels dari lfg-tool dan tandai yang \`Not found\` atau \`Empty\` untuk cleanup cepat.\n\n` +
              `**Ringkasan** • Total: \`${total}\` • Active: \`${active}\` • Empty: \`${empty}\` • Not found: \`${notFound}\``,
          },
          { type: 14, divider: true, spacing: 1 },
          ...(rowComponents.length
            ? rowComponents
            : [
                {
                  type: 10,
                  content: 'Tidak ada temp voice channel yang sedang terdaftar.',
                },
              ]),
          ...(rows.length > 20
            ? [
                { type: 14, divider: true, spacing: 1 },
                {
                  type: 10,
                  content: `-# Menampilkan 20 dari ${rows.length} channel.`,
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
              description: 'User avatar',
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

  const summaryParagraph =
    `<@${targetUser.id}> sudah menghabiskan total \`${formatDuration(stats.totalMs)}\` ` +
    `dalam \`${stats.sessions}\` sesi voice. Rata-rata durasi per sesi ` +
    `adalah \`${formatDuration(averageMs)}\`, dengan sesi terpanjang ` +
    `\`${formatDuration(stats.longestMs)}\`.`;

  const activeStatus = stats.activeNow
    ? `Aktif sekarang selama \`${formatDuration(currentSessionMs)}\``
    : 'Tidak sedang aktif di voice';

  const lines = [
    '**Detail Lainnya**',
    `- Pernah Jadi Owner: \`${stats.ownerCount}\``,
    `- Rank Server: \`${stats.rank ?? '-'}\``,
    `- Status Voice: ${activeStatus}`,
  ];

  const avatarUrl = targetUser.displayAvatarURL({
    extension: 'png',
    size: 128,
    forceStatic: true,
  });

  return buildStatsContainerPayload({
    title: '### Voice Stats',
    introParagraph: summaryParagraph,
    lines,
    avatarUrl,
    accentColor: 0x2563eb,
    mentionUserId: targetUser.id,
    ephemeral,
  });
}

function createStatsManager({ client, configStore }) {
  async function registerCommands() {
    const statsCommand = buildStatsCommand();
    const voicecheckCommand = buildVoicecheckCommand();
    const guilds = [...client.guilds.cache.values()];

    await Promise.allSettled(
      guilds.map(async (guild) => {
        try {
          await guild.commands.set([statsCommand, voicecheckCommand]);
        } catch (error) {
          if (error?.code === 50001) {
            console.warn(`Skipped command registration for guild ${guild.id}: missing access.`);
            return;
          }
          console.error(`Failed to register commands for guild ${guild.id}:`, error);
        }
      })
    );
  }

  async function replyVoicecheck(interaction) {
    if (!interaction.guildId || !interaction.guild) {
      await interaction.reply({
        content: 'Perintah ini hanya bisa digunakan di server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!isVoicecheckAllowed(interaction)) {
      await interaction.reply({
        content: 'Hanya admin/mod dengan Manage Channels yang bisa pakai command ini.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const rows = await getVoicecheckSnapshot(configStore, interaction.guild);
    await interaction.reply(buildVoicecheckPayload(rows));
  }

  async function handleVoicecheckDelete(interaction) {
    if (!interaction.guildId || !interaction.guild) {
      await interaction.reply({
        content: 'Aksi ini hanya bisa digunakan di server.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (!isVoicecheckAllowed(interaction)) {
      await interaction.reply({
        content: 'Hanya admin/mod dengan Manage Channels yang bisa pakai aksi ini.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const [, channelId] = interaction.customId.split(':');
    if (!channelId) {
      await interaction.reply({
        content: 'Channel ID tidak valid.',
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
          content: 'Record temp channel tidak ditemukan atau sudah terhapus.',
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }

      if (row.state === 'active') {
        await interaction.followUp({
          content: 'Channel masih aktif. Delete hanya untuk status Not found atau Empty.',
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }

      const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
      if (channel && channel.isVoiceBased()) {
        if ((channel.members?.size || 0) > 0) {
          await interaction.followUp({
            content: 'Channel masih ada user aktif, delete dibatalkan.',
            flags: MessageFlags.Ephemeral,
          });
          return true;
        }

        await channel
          .delete(`Voicecheck cleanup by ${interaction.user.id}`)
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

      await configStore.removeTempChannel(channelId);

      const refreshed = await getVoicecheckSnapshot(configStore, interaction.guild);
      await interaction.editReply(buildVoicecheckPayload(refreshed));
      await interaction.followUp({
        content: `Cleanup berhasil untuk channel \`${channelId}\`.`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    } catch (error) {
      console.error('Voicecheck delete failed:', error);
      await interaction.followUp({
        content: 'Gagal menjalankan cleanup channel. Coba lagi sebentar.',
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
      return true;
    }
  }

  async function replyStats(interaction, targetUser, options = {}) {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        content: 'Perintah ini hanya bisa digunakan di server.',
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
      })
    );
  }

  async function replyMyStats(interaction, options = {}) {
    await replyStats(interaction, interaction.user, options);
  }

  async function replyLeaderboard(interaction, options = {}) {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        content: 'Perintah ini hanya bisa digunakan di server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const rows = await configStore.getVoiceLeaderboard(guildId, 10);
    if (!rows.length) {
      const payload = {
        content: 'Belum ada data leaderboard voice.',
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
        `${row.rank}. <@${row.userId}> • \`${formatDuration(row.totalMs)}\` • ${row.sessions} sesi`
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
    const summaryParagraph =
      `Top ${rows.length} leaderboard saat ini mencatat total \`${formatDuration(totalDurationMs)}\` ` +
      `dalam \`${totalSessions}\` sesi voice. Peringkat pertama dipegang ` +
      `<@${topUser.userId}> dengan total \`${formatDuration(topUser.totalMs)}\`.`;

    const avatarUrl = interaction.user.displayAvatarURL({
      extension: 'png',
      size: 128,
      forceStatic: true,
    });

    await interaction.reply(
      buildStatsContainerPayload({
        title: '### Voice Leaderboard (Top 10)',
        introParagraph: summaryParagraph,
        lines,
        avatarUrl,
        accentColor: 0xf59e0b,
        ephemeral: options.ephemeral ?? false,
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
        await interaction.reply({
          content: 'Subcommand ini hanya untuk admin.',
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

    await interaction.reply({
      content: 'Subcommand tidak dikenal.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  return {
    handleInteraction,
    replyLeaderboard,
    replyMyStats,
    registerCommands,
  };
}

module.exports = {
  createStatsManager,
  buildStatsCommand,
  buildVoicecheckCommand,
};
