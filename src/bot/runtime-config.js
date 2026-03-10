const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');

const ALGORITHM = 'aes-256-gcm';
const SETUP_STATE_PATH = path.resolve(__dirname, '..', '..', '.setup-state.json');
const DASHBOARD_ENV_PATH = path.resolve(__dirname, '..', '..', 'dashboard', '.env');
const DASHBOARD_ENV_LOCAL_PATH = path.resolve(__dirname, '..', '..', 'dashboard', '.env.local');

function readEnvFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, 'utf8');
    return dotenv.parse(raw);
  } catch {
    return {};
  }
}

function getSecretCandidates() {
  const candidates = [
    process.env.SETUP_SECRET,
    process.env.NEXTAUTH_SECRET,
  ];

  const dashboardEnv = readEnvFile(DASHBOARD_ENV_PATH);
  const dashboardEnvLocal = readEnvFile(DASHBOARD_ENV_LOCAL_PATH);

  candidates.push(
    dashboardEnv.SETUP_SECRET,
    dashboardEnv.NEXTAUTH_SECRET,
    dashboardEnvLocal.SETUP_SECRET,
    dashboardEnvLocal.NEXTAUTH_SECRET
  );

  return [...new Set(candidates.filter((value) => typeof value === 'string' && value.trim()))];
}

function deriveKey(secret) {
  return crypto.scryptSync(secret, 'setup-wizard-salt', 32);
}

function decryptSetupValue(encoded, secret) {
  const raw = Buffer.from(encoded, 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const key = deriveKey(secret);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

function readSetupState() {
  try {
    if (!fs.existsSync(SETUP_STATE_PATH)) {
      return null;
    }

    const raw = fs.readFileSync(SETUP_STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function applyRuntimeConfig() {
  const setupState = readSetupState();
  if (!setupState) {
    return {
      setupStateLoaded: false,
      tokenFromSetup: false,
      databaseFromSetup: false,
    };
  }

  const secretCandidates = getSecretCandidates();

  let tokenFromSetup = false;
  if (typeof setupState.botToken === 'string' && setupState.botToken.trim()) {
    process.env.DISCORD_TOKEN = setupState.botToken.trim();
    tokenFromSetup = true;
  }

  if (typeof setupState.botTokenEncrypted === 'string' && secretCandidates.length > 0) {
    if (!tokenFromSetup) {
      for (const secret of secretCandidates) {
        try {
          process.env.DISCORD_TOKEN = decryptSetupValue(setupState.botTokenEncrypted, secret);
          tokenFromSetup = true;
          break;
        } catch {
          // try next secret candidate
        }
      }
    }
  }

  let databaseFromSetup = false;
  if (
    setupState.databaseProvider !== 'local_sqlite'
    && typeof setupState.databaseUrl === 'string'
    && setupState.databaseUrl.trim()
  ) {
    process.env.DATABASE_URL = setupState.databaseUrl.trim();
    databaseFromSetup = true;
  }

  if (
    setupState.databaseProvider !== 'local_sqlite'
    && typeof setupState.databaseUrlEncrypted === 'string'
    && secretCandidates.length > 0
  ) {
    if (!databaseFromSetup) {
      for (const secret of secretCandidates) {
        try {
          process.env.DATABASE_URL = decryptSetupValue(setupState.databaseUrlEncrypted, secret);
          databaseFromSetup = true;
          break;
        } catch {
          // try next secret candidate
        }
      }
    }
  }

  if (
    setupState.setupComplete
    && (!process.env.DISCORD_TOKEN || !process.env.DATABASE_URL)
    && (typeof setupState.botTokenEncrypted === 'string' || typeof setupState.databaseUrlEncrypted === 'string')
  ) {
    const hasSecrets = secretCandidates.length > 0;
    const reason = hasSecrets
      ? 'Could not decrypt .setup-state.json with available SETUP_SECRET/NEXTAUTH_SECRET values.'
      : 'Missing SETUP_SECRET/NEXTAUTH_SECRET, cannot decrypt .setup-state.json values.';
    console.error(
      `[runtime-config] ${reason} Re-save Step 3 (Bot Token) and Step 6 (Database) in /setup to store readable runtime values.`
    );
  }

  return {
    setupStateLoaded: true,
    tokenFromSetup,
    databaseFromSetup,
  };
}

module.exports = {
  applyRuntimeConfig,
};
