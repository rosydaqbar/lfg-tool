const { DISCORD_TOKEN, LOG_CHANNEL_ID, VOICE_CHANNEL_ID, DEBUG } = process.env;

function requireToken() {
  if (!DISCORD_TOKEN) {
    console.error('Missing DISCORD_TOKEN in environment.');
    process.exit(1);
  }
}

function requireBotRuntimeEnv() {
  const missing = [];
  if (!process.env.DISCORD_TOKEN) missing.push('DISCORD_TOKEN');
  if (!process.env.DATABASE_URL) missing.push('DATABASE_URL');

  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

module.exports = {
  DISCORD_TOKEN,
  LOG_CHANNEL_ID,
  VOICE_CHANNEL_ID,
  DEBUG,
  requireBotRuntimeEnv,
  requireToken,
};
