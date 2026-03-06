require('dotenv').config();

const { applyRuntimeConfig } = require('./bot/runtime-config');
applyRuntimeConfig();

const { Client, GatewayIntentBits, Events, MessageFlags } = require('discord.js');
const configStore = require('./config-store');
const { createDebugLogger } = require('./bot/debug');
const {
  requireBotRuntimeEnv,
  requireToken,
  DISCORD_TOKEN,
  LOG_CHANNEL_ID,
  VOICE_CHANNEL_ID,
  DEBUG,
} = require('./bot/env');
const { createJoinToCreateManager } = require('./bot/join-to-create');
const { createLfgManager } = require('./bot/lfg');
const { createLogChannelFetcher } = require('./bot/log-channel');
const { createVoiceLogger } = require('./bot/voice-log');
const { createHealthServer } = require('./bot/health-server');
const { createStatsManager } = require('./bot/stats');
const { createLogger } = require('./lib/logger');

const logger = createLogger('bot');

requireBotRuntimeEnv();
requireToken();

if (!LOG_CHANNEL_ID) {
  logger.warn('LOG_CHANNEL_ID not set. Using dashboard configuration only.');
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const debugLog = createDebugLogger(DEBUG === 'true');
const { getLogChannel } = createLogChannelFetcher(client);
const statsManager = createStatsManager({
  client,
  configStore,
});
const lfgManager = createLfgManager({
  client,
  getLogChannel,
  configStore,
  env: { LOG_CHANNEL_ID },
  statsManager,
});
const joinToCreateManager = createJoinToCreateManager({
  client,
  configStore,
  lfgManager,
  env: { LOG_CHANNEL_ID },
});
const voiceLogger = createVoiceLogger({
  getLogChannel,
  debugLog,
  configStore,
  env: { LOG_CHANNEL_ID, VOICE_CHANNEL_ID },
});
const healthServer = createHealthServer();

healthServer.start();

const GUILD_CONFIG_TTL_MS = 5000;
const guildConfigCache = new Map();
const guildConfigInFlight = new Map();

async function getCachedGuildConfig(guildId) {
  const now = Date.now();
  const cached = guildConfigCache.get(guildId);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const pending = guildConfigInFlight.get(guildId);
  if (pending) {
    return pending;
  }

  const loadPromise = configStore
    .getGuildConfig(guildId)
    .then((value) => {
      guildConfigCache.set(guildId, {
        value,
        expiresAt: Date.now() + GUILD_CONFIG_TTL_MS,
      });
      return value;
    })
    .finally(() => {
      guildConfigInFlight.delete(guildId);
    });

  guildConfigInFlight.set(guildId, loadPromise);
  return loadPromise;
}

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Received ${signal}. Shutting down...`);

  try {
    lfgManager.stopPersistentLoop?.();
  } catch (error) {
    logger.error('Failed to stop persistent loop:', error);
  }

  try {
    healthServer.stop();
  } catch (error) {
    logger.error('Failed to stop health server:', error);
  }

  try {
    if (client.isReady()) {
      await client.destroy();
    }
  } catch (error) {
    logger.error('Failed to destroy Discord client:', error);
  }

  process.exit(0);
}

process.on('SIGTERM', () => {
  shutdown('SIGTERM').catch((error) => {
    console.error('Graceful shutdown failed:', error);
    process.exit(1);
  });
});

process.on('SIGINT', () => {
  shutdown('SIGINT').catch((error) => {
    console.error('Graceful shutdown failed:', error);
    process.exit(1);
  });
});

client.once(Events.ClientReady, () => {
  logger.info(`Logged in as ${client.user.tag}`);
  lfgManager.startPersistentLoop();
  statsManager.registerCommands().catch((error) => {
    logger.error('Failed to register slash commands:', error);
  });
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (await statsManager.handleInteraction(interaction)) {
      return;
    }
    await lfgManager.handleInteraction(interaction);
  } catch (error) {
    console.error('Failed to handle interaction:', error);
    if (!interaction.isRepliable()) return;
    if (interaction.deferred || interaction.replied) {
      await interaction
        .followUp({
          content: 'Terjadi kesalahan saat memproses interaksi.',
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => null);
      return;
    }
    await interaction
      .reply({
        content: 'Terjadi kesalahan saat memproses interaksi.',
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => null);
  }
});

client.on('voiceStateUpdate', async (oldState, newState) => {
  debugLog('voiceStateUpdate', {
    userId: newState.id,
    oldChannelId: oldState.channelId,
    newChannelId: newState.channelId,
  });

  const guildId = newState.guild?.id || oldState.guild?.id;
  if (!guildId) {
    debugLog('Skip: missing guild id');
    return;
  }

  let config = {
    logChannelId: null,
    lfgChannelId: null,
    enabledVoiceChannelIds: [],
    joinToCreateLobbyIds: [],
    joinToCreateLobbies: [],
  };
  try {
    config = await getCachedGuildConfig(guildId);
  } catch (error) {
    console.error('Failed to read dashboard config:', error);
  }

  await joinToCreateManager.handleJoinToCreate(oldState, newState, config);

  const manualSummaryCache = new Map();

  async function buildManualActivitySummary(channelId) {
    if (!channelId) {
      return {
        active: [],
        history: [],
        activeCount: 0,
        historyCount: 0,
      };
    }

    if (manualSummaryCache.has(channelId)) {
      return manualSummaryCache.get(channelId);
    }

    const manualActivityRows = await configStore
      .getManualVoiceActivity(guildId, channelId)
      .catch((error) => {
        console.error('Failed to load manual voice activity:', error);
        return [];
      });

    const active = manualActivityRows
      .filter((row) => row.isActive)
      .sort((a, b) => {
        const aTime = a.joinedAt ? a.joinedAt.getTime() : 0;
        const bTime = b.joinedAt ? b.joinedAt.getTime() : 0;
        return bTime - aTime;
      });

    const history = manualActivityRows
      .filter((row) => !row.isActive)
      .sort((a, b) => {
        const aTime = a.updatedAt ? a.updatedAt.getTime() : 0;
        const bTime = b.updatedAt ? b.updatedAt.getTime() : 0;
        return bTime - aTime;
      });

    const summary = {
      active,
      history,
      activeCount: active.length,
      historyCount: history.length,
    };

    manualSummaryCache.set(channelId, summary);
    return summary;
  }

  const member = newState.member || oldState.member;
  if (!member?.user?.bot) {
    const oldChannelId = oldState.channelId;
    const newChannelId = newState.channelId;
    const moved = oldChannelId !== newChannelId;

    const [oldTempInfo, newTempInfo] = await Promise.all([
      oldChannelId
        ? configStore.getTempChannelInfo(oldChannelId).catch(() => null)
        : Promise.resolve(null),
      newChannelId
        ? configStore.getTempChannelInfo(newChannelId).catch(() => null)
        : Promise.resolve(null),
    ]);

    if (moved && oldTempInfo) {
      await configStore
        .markVoiceLeave(oldChannelId, newState.id, new Date())
        .catch((error) => {
          console.error('Failed to mark voice leave:', error);
        });
      await lfgManager
        .refreshJoinToCreatePrompt(oldState.guild || newState.guild, oldChannelId)
        .catch(() => null);
    }

    if (moved && newTempInfo) {
      await configStore
        .upsertVoiceJoin(newChannelId, newState.id, new Date())
        .catch((error) => {
          console.error('Failed to mark voice join:', error);
        });
      await lfgManager
        .refreshJoinToCreatePrompt(newState.guild || oldState.guild, newChannelId)
        .catch(() => null);
    }

    const manualEnabledIds = new Set(config.enabledVoiceChannelIds || []);
    const oldIsManualLogged = Boolean(
      moved
      && oldChannelId
      && manualEnabledIds.has(oldChannelId)
      && !oldTempInfo
    );
    const newIsManualLogged = Boolean(
      moved
      && newChannelId
      && manualEnabledIds.has(newChannelId)
      && !newTempInfo
    );

    if (oldIsManualLogged) {
      const finalizedSession = await configStore
        .finalizeManualVoiceSession(
          guildId,
          oldChannelId,
          newState.id,
          oldState.channel?.name || null,
          new Date()
        )
        .catch((error) => {
          console.error('Failed to finalize manual voice session:', error);
          return null;
        });

      if (finalizedSession) {
        await voiceLogger
          .logManualLeave(
            {
              guildId,
              userId: finalizedSession.userId,
              channelId: finalizedSession.channelId,
              channelName: finalizedSession.channelName,
              leftAt: finalizedSession.leftAt,
              totalMs: finalizedSession.totalMs,
            },
            config
          )
          .catch((error) => {
            console.error('Failed to send manual session leave log:', error);
          });
      }

      const oldChannelMembers = oldState.channel?.members?.size || 0;
      if (oldChannelMembers === 0) {
        await voiceLogger
          .clearManualSessionPanel({
            guildId,
            channelId: oldChannelId,
            voiceChannel: oldState.channel,
          })
          .catch((error) => {
            console.error('Failed to clear manual session panel:', error);
          });
      } else if (oldState.channel) {
        const activity = await buildManualActivitySummary(oldChannelId);
        await voiceLogger
          .refreshManualSessionPanel(oldState.channel, { activity })
          .catch((error) => {
            console.error('Failed to refresh manual session panel:', error);
          });
      }
    }

    if (newIsManualLogged) {
      const startedAt = new Date();
      await configStore
        .upsertManualVoiceJoin(guildId, newChannelId, newState.id, startedAt)
        .catch((error) => {
          console.error('Failed to upsert manual voice join:', error);
        });

      if (newState.channel) {
        const activity = await buildManualActivitySummary(newChannelId);
        await voiceLogger
          .refreshManualSessionPanel(newState.channel, { activity })
          .catch((error) => {
            console.error('Failed to send manual session panel:', error);
          });
      }
    }

  }

  if (oldState.channelId && oldState.channelId !== newState.channelId) {
    await joinToCreateManager.cleanupTempChannel(oldState);
  }

  const joined = !oldState.channelId && newState.channelId;
  if (!joined) {
    debugLog('Skip: not a join');
  }
});

client.login(DISCORD_TOKEN);
