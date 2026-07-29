const { networkInterfaces } = require('os');
const { DISCORD_TOKEN, LOG_CHANNEL_ID, VOICE_CHANNEL_ID, DEBUG, DASHBOARD_URL } = process.env;
const fs = require('fs');
const path = require('path');

const SETUP_STATE_PATH = path.resolve(__dirname, '..', '..', '.setup-state.json');

function isPrivateIpv4(address) {
  return address.startsWith('10.')
    || address.startsWith('192.168.')
    || /^172\.(1[6-9]|2\d|3[01])\./.test(address);
}

function getLocalIpv4Address() {
  const addresses = Object.values(networkInterfaces())
    .flat()
    .filter((entry) => entry && !entry.internal && (entry.family === 'IPv4' || entry.family === 4))
    .map((entry) => entry.address);
  return addresses.find((address) => address.startsWith('192.168.'))
    || addresses.find((address) => address.startsWith('10.'))
    || addresses.find(isPrivateIpv4)
    || addresses[0]
    || '127.0.0.1';
}

function getDashboardUrl() {
  const configured = String(DASHBOARD_URL || '').trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        return url.toString().replace(/\/$/, '');
      }
    } catch {
      // Fall through to the local dashboard URL.
    }
  }
  return `http://${getLocalIpv4Address()}:3000`;
}

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
  DASHBOARD_URL,
  getDashboardUrl,
  requireBotRuntimeEnv,
  requireToken,
};
