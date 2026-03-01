const {
  MessageFlags,
  SlashCommandBuilder,
} = require('discord.js');

const ADMIN_ID = process.env.ADMIN_DISCORD_USER_ID || null;
const STATS_COMMAND = 'stats';

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

function createStatsManager({ client, configStore }) {
  function buildStatsContainerPayload({
    title,
    introParagraph = null,
    lines,
    avatarUrl,
    accentColor = 0x3b82f6,
    mentionUserId = null,
  }) {
    return {
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      components: [
        {
          type: 17,
          accent_color: accentColor,
          components: [
            {
              type: 9,
              components: [
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
            ...(introParagraph
              ? [
                  {
                    type: 10,
                    content: introParagraph,
                  },
                ]
              : []),
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

  async function registerCommands() {
    const command = buildStatsCommand();
    const guilds = [...client.guilds.cache.values()];

    await Promise.allSettled(
      guilds.map(async (guild) => {
        try {
          await guild.commands.set([command]);
        } catch (error) {
          console.error(`Failed to register stats command for guild ${guild.id}:`, error);
        }
      })
    );
  }

  async function replyStats(interaction, targetUser) {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        content: 'Perintah ini hanya bisa digunakan di server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

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

    await interaction.reply(
      buildStatsContainerPayload({
        title: `### Voice Stats`,
        introParagraph: summaryParagraph,
        lines,
        avatarUrl,
        accentColor: 0x2563eb,
        mentionUserId: targetUser.id,
      })
    );
  }

  async function replyLeaderboard(interaction) {
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
      await interaction.reply({
        content: 'Belum ada data leaderboard voice.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const lines = [];
    for (const row of rows) {
      lines.push(
        `${row.rank}. <@${row.userId}> • \`${formatDuration(row.totalMs)}\` • ${row.sessions} sesi`
      );
    }

    const avatarUrl = interaction.user.displayAvatarURL({
      extension: 'png',
      size: 128,
      forceStatic: true,
    });

    await interaction.reply(
      buildStatsContainerPayload({
        title: '### Voice Leaderboard (Top 10)',
        lines,
        avatarUrl,
        accentColor: 0xf59e0b,
      })
    );
  }

  async function handleInteraction(interaction) {
    if (!interaction.isChatInputCommand()) return false;
    if (interaction.commandName !== STATS_COMMAND) return false;

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'me') {
      await replyStats(interaction, interaction.user);
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
    registerCommands,
  };
}

module.exports = { createStatsManager, buildStatsCommand };
