const { DISCORD_TOKEN, LOG_CHANNEL_ID, VOICE_CHANNEL_ID, DEBUG } = process.env;
const fs = require('fs');
const path = require('path');

const SETUP_STATE_PATH = path.resolve(__dirname, '..', '..', '.setup-state.json');

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
    if (fs.existsSync(SETUP_STATE_PATH)) {
      console.error(
        `Found ${SETUP_STATE_PATH}, but bot credentials could not be loaded from it. `
        + 'Verify SETUP_SECRET/NEXTAUTH_SECRET matches the one used during setup, '
        + 'or re-save bot token and database in setup wizard.'
      );
    }
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
