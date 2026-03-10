import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { decryptSetupValue } from "@/lib/setup-crypto";

const DASHBOARD_DIR_NAME = "dashboard";

function getWorkspaceRoot() {
  return path.basename(process.cwd()).toLowerCase() === DASHBOARD_DIR_NAME
    ? path.resolve(process.cwd(), "..")
    : process.cwd();
}

function loadDotenvFiles() {
  const cwd = process.cwd();
  const root = getWorkspaceRoot();
  const envCandidates = [
    path.resolve(cwd, ".env.local"),
    path.resolve(cwd, ".env"),
    path.resolve(root, ".env.local"),
    path.resolve(root, ".env"),
  ];

  for (const envPath of envCandidates) {
    if (!fs.existsSync(envPath)) continue;
    dotenv.config({ path: envPath, override: false });
  }
}

function hydrateFromSetupState() {
  const setupStatePath = path.resolve(getWorkspaceRoot(), ".setup-state.json");
  if (!fs.existsSync(setupStatePath)) return;

  try {
    const raw = fs.readFileSync(setupStatePath, "utf8");
    const setup = JSON.parse(raw) as {
      ownerDiscordId?: string | null;
      databaseProvider?: "local_sqlite" | "local_postgres" | "supabase" | null;
      databaseUrl?: string | null;
      databaseUrlEncrypted?: string | null;
      discordClientId?: string | null;
      discordClientSecret?: string | null;
      discordClientSecretEncrypted?: string | null;
      botToken?: string | null;
      botTokenEncrypted?: string | null;
    };

    if (!process.env.ADMIN_DISCORD_USER_ID && setup.ownerDiscordId) {
      process.env.ADMIN_DISCORD_USER_ID = setup.ownerDiscordId;
    }

    if (!process.env.DISCORD_CLIENT_ID && setup.discordClientId) {
      process.env.DISCORD_CLIENT_ID = setup.discordClientId;
    }

    if (!process.env.DISCORD_CLIENT_SECRET) {
      if (setup.discordClientSecret && setup.discordClientSecret.trim()) {
        process.env.DISCORD_CLIENT_SECRET = setup.discordClientSecret.trim();
      } else if (setup.discordClientSecretEncrypted) {
        process.env.DISCORD_CLIENT_SECRET = decryptSetupValue(setup.discordClientSecretEncrypted);
      }
    }

    if (!process.env.DISCORD_TOKEN && !process.env.DISCORD_BOT_TOKEN) {
      if (setup.botToken && setup.botToken.trim()) {
        process.env.DISCORD_TOKEN = setup.botToken.trim();
      } else if (setup.botTokenEncrypted) {
        process.env.DISCORD_TOKEN = decryptSetupValue(setup.botTokenEncrypted);
      }
    }

    if (!process.env.DATABASE_URL && setup.databaseProvider !== "local_sqlite") {
      if (setup.databaseUrl && setup.databaseUrl.trim()) {
        process.env.DATABASE_URL = setup.databaseUrl.trim();
      } else if (setup.databaseUrlEncrypted) {
        process.env.DATABASE_URL = decryptSetupValue(setup.databaseUrlEncrypted);
      }
    }
  } catch {
    // Keep boot resilient; setup wizard can still recover missing values.
  }
}

function applySafeFallbacks() {
  if (!process.env.NEXTAUTH_SECRET) {
    process.env.NEXTAUTH_SECRET = "dev-only-nextauth-secret-change-me";
  }
}

loadDotenvFiles();
hydrateFromSetupState();
applySafeFallbacks();
