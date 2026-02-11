const { DISCORD_TOKEN, LOG_CHANNEL_ID, VOICE_CHANNEL_ID, DEBUG } = process.env;

function requireToken() {
  if (!DISCORD_TOKEN) {
    console.error('Missing DISCORD_TOKEN in environment.');
    process.exit(1);
  }
}

module.exports = {
  DISCORD_TOKEN,
  LOG_CHANNEL_ID,
  VOICE_CHANNEL_ID,
  DEBUG,
  requireToken,
};
