require('dotenv').config();

const { Client, GatewayIntentBits, Events } = require('discord.js');
const configStore = require('./config-store');
const { createDebugLogger } = require('./bot/debug');
const { requireToken, DISCORD_TOKEN, LOG_CHANNEL_ID, VOICE_CHANNEL_ID, DEBUG } = require('./bot/env');
const { createJoinToCreateManager } = require('./bot/join-to-create');
const { createLfgManager } = require('./bot/lfg');
const { createLogChannelFetcher } = require('./bot/log-channel');
const { createMetricsReporter } = require('./bot/metrics');
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
const metricsReporter = createMetricsReporter({
  setProcessMetrics: configStore.setProcessMetrics,
});
const healthServer = createHealthServer();

healthServer.start();

client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);
  lfgManager.startPersistentLoop();
  metricsReporter.start();
});

client.on(Events.InteractionCreate, async (interaction) => {
  await lfgManager.handleInteraction(interaction);
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
