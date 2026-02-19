require('dotenv').config();

const { Client, GatewayIntentBits, Events, MessageFlags } = require('discord.js');
const configStore = require('./config-store');
const { createDebugLogger } = require('./bot/debug');
const { requireToken, DISCORD_TOKEN, LOG_CHANNEL_ID, VOICE_CHANNEL_ID, DEBUG } = require('./bot/env');
const { createJoinToCreateManager } = require('./bot/join-to-create');
const { createLfgManager } = require('./bot/lfg');
const { createLogChannelFetcher } = require('./bot/log-channel');
const { createVoiceLogger } = require('./bot/voice-log');
const { createHealthServer } = require('./bot/health-server');

requireToken();

if (!LOG_CHANNEL_ID) {
  console.warn('LOG_CHANNEL_ID not set. Using dashboard configuration only.');
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const debugLog = createDebugLogger(DEBUG === 'true');
const { getLogChannel } = createLogChannelFetcher(client);
const lfgManager = createLfgManager({
  client,
  getLogChannel,
  configStore,
  env: { LOG_CHANNEL_ID },
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
  env: { LOG_CHANNEL_ID, VOICE_CHANNEL_ID },
});
const healthServer = createHealthServer();

healthServer.start();

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}. Shutting down...`);

  try {
    lfgManager.stopPersistentLoop?.();
  } catch (error) {
    console.error('Failed to stop persistent loop:', error);
  }

  try {
    healthServer.stop();
  } catch (error) {
    console.error('Failed to stop health server:', error);
  }

  try {
    if (client.isReady()) {
      await client.destroy();
    }
  } catch (error) {
    console.error('Failed to destroy Discord client:', error);
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
  console.log(`Logged in as ${client.user.tag}`);
  lfgManager.startPersistentLoop();
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
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

  if (oldState.channelId && oldState.channelId !== newState.channelId) {
    await joinToCreateManager.cleanupTempChannel(oldState);
  }

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
    config = await configStore.getGuildConfig(guildId);
  } catch (error) {
    console.error('Failed to read dashboard config:', error);
  }

  await joinToCreateManager.handleJoinToCreate(oldState, newState, config);

  const joined = !oldState.channelId && newState.channelId;
  if (!joined) {
    debugLog('Skip: not a join');
    return;
  }

  await voiceLogger.logJoin(newState, config);
});

client.login(DISCORD_TOKEN);
