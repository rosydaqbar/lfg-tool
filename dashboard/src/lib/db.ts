import "./env";
import fs from "fs";
import path from "path";
import { Pool } from "pg";
import { buildPgSslConfig } from "@/lib/pg-ssl";

type GuildConfig = {
  logChannelId: string | null;
  lfgChannelId: string | null;
  enabledVoiceChannelIds: string[];
  joinToCreateLobbies: {
    channelId: string;
    roleId: string | null;
    lfgEnabled: boolean;
  }[];
};

export type SetupState = {
  ownerDiscordId: string | null;
  setupComplete: boolean;
  selectedGuildId: string | null;
  logChannelId: string | null;
  lfgChannelId: string | null;
  databaseProvider: "local_postgres" | "local_sqlite" | "supabase" | null;
  databaseValidatedAt: string | null;
  botTokenSet: boolean;
  botDisplayName: string | null;
  discordClientId: string | null;
  discordClientSecretSet: boolean;
  databaseUrlSet: boolean;
  steps: {
    ownerClaimed: boolean;
    discordAppConfigured: boolean;
    botTokenValidated: boolean;
    guildValidated: boolean;
    inviteChecked: boolean;
    databaseValidated: boolean;
    channelsSaved: boolean;
  };
};

const DATABASE_URL = process.env.DATABASE_URL;
const DASHBOARD_DIR_NAME = "dashboard";
const workspaceRoot = path.basename(process.cwd()).toLowerCase() === DASHBOARD_DIR_NAME
  ? path.resolve(process.cwd(), "..")
  : process.cwd();
const SETUP_STATE_FALLBACK_PATH = path.resolve(workspaceRoot, ".setup-state.json");
const sqlitePathInput = process.env.SQLITE_PATH || "dashboard-local.db";
const SQLITE_PATH = path.isAbsolute(sqlitePathInput)
  ? sqlitePathInput
  : path.resolve(workspaceRoot, sqlitePathInput);

const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: buildPgSslConfig(),
    })
  : null;

type SqliteStatement = {
  get: (...args: unknown[]) => unknown;
  all: (...args: unknown[]) => unknown;
  run: (...args: unknown[]) => unknown;
};

type SqliteDatabase = {
  pragma: (statement: string) => unknown;
  exec: (sql: string) => unknown;
  prepare: (sql: string) => SqliteStatement;
  transaction: <T extends (...args: never[]) => unknown>(fn: T) => T;
};

let sqliteDb: SqliteDatabase | null = null;

function getSqliteDb() {
  if (sqliteDb) return sqliteDb;
  fs.mkdirSync(path.dirname(SQLITE_PATH), { recursive: true });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3");
  const db = new Database(SQLITE_PATH) as SqliteDatabase;
  db.pragma("journal_mode = WAL");
  const ensureColumn = (tableName: string, columnName: string, columnDef: string) => {
    const columns = db
      .prepare(`PRAGMA table_info(${tableName})`)
      .all() as { name: string }[];
    if (columns.some((column) => column.name === columnName)) {
      return;
    }
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
  };
  db.exec(`
    CREATE TABLE IF NOT EXISTS guild_config (
      guild_id TEXT PRIMARY KEY,
      log_channel_id TEXT,
      lfg_channel_id TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS voice_watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      voice_channel_id TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS join_to_create_lobbies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      lobby_channel_id TEXT NOT NULL,
      role_id TEXT,
      lfg_enabled INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS temp_voice_channels (
      channel_id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      lfg_channel_id TEXT,
      lfg_message_id TEXT,
      role_id TEXT,
      lfg_enabled INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS temp_voice_delete_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      channel_name TEXT,
      owner_id TEXT NOT NULL,
      deleted_at TEXT NOT NULL,
      history_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS manual_voice_session_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      channel_name TEXT,
      owner_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      joined_at TEXT NOT NULL,
      left_at TEXT NOT NULL,
      total_ms INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);
  ensureColumn("join_to_create_lobbies", "role_id", "TEXT");
  ensureColumn("join_to_create_lobbies", "lfg_enabled", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn("temp_voice_channels", "role_id", "TEXT");
  ensureColumn("temp_voice_channels", "lfg_enabled", "INTEGER NOT NULL DEFAULT 1");
  sqliteDb = db;
  return db;
}

async function getPool() {
  if (!pool) {
    throw new Error("DATABASE_URL is required.");
  }
  return pool;
}

async function query(text: string, params?: unknown[]) {
  const db = await getPool();
  return db.query(text, params);
}

function readSetupStateFallback(): Record<string, unknown> {
  try {
    if (!fs.existsSync(SETUP_STATE_FALLBACK_PATH)) {
      return {};
    }
    const raw = fs.readFileSync(SETUP_STATE_FALLBACK_PATH, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeSetupStateFallback(nextState: Record<string, unknown>) {
  fs.writeFileSync(
    SETUP_STATE_FALLBACK_PATH,
    JSON.stringify(nextState, null, 2),
    "utf8"
  );
}

let lfgEnabledColumnEnsured = false;
let tempVoiceDeleteLogsEnsured = false;
let manualVoiceSessionLogsEnsured = false;
let setupStateEnsured = false;
let coreConfigTablesEnsured = false;

async function ensureCoreConfigTables() {
  if (coreConfigTablesEnsured || !DATABASE_URL) return;
  try {
    await query(
      `
        CREATE TABLE IF NOT EXISTS guild_config (
          guild_id TEXT PRIMARY KEY,
          log_channel_id TEXT,
          lfg_channel_id TEXT,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
    );
    await query(
      `
        CREATE TABLE IF NOT EXISTS voice_watchlist (
          id BIGSERIAL PRIMARY KEY,
          guild_id TEXT NOT NULL,
          voice_channel_id TEXT NOT NULL,
          enabled BOOLEAN NOT NULL DEFAULT TRUE
        )
      `
    );
    await query(
      `
        CREATE TABLE IF NOT EXISTS join_to_create_lobbies (
          id BIGSERIAL PRIMARY KEY,
          guild_id TEXT NOT NULL,
          lobby_channel_id TEXT NOT NULL,
          role_id TEXT,
          lfg_enabled BOOLEAN NOT NULL DEFAULT TRUE
        )
      `
    );
    coreConfigTablesEnsured = true;
  } catch (error) {
    console.error("Failed to ensure core config tables:", error);
  }
}

async function ensureJoinToCreateLfgEnabledColumn() {
  if (lfgEnabledColumnEnsured) return;
  try {
    await query(
      "ALTER TABLE IF EXISTS join_to_create_lobbies ADD COLUMN IF NOT EXISTS lfg_enabled BOOLEAN NOT NULL DEFAULT TRUE"
    );
    lfgEnabledColumnEnsured = true;
  } catch (error) {
    console.error(
      "Failed to ensure join_to_create_lobbies.lfg_enabled column:",
      error
    );
  }
}

async function ensureTempVoiceDeleteLogsTable() {
  if (tempVoiceDeleteLogsEnsured) return;
  try {
    await query(
      `
        CREATE TABLE IF NOT EXISTS temp_voice_delete_logs (
          id BIGSERIAL PRIMARY KEY,
          guild_id TEXT NOT NULL,
          channel_id TEXT NOT NULL,
          channel_name TEXT,
          owner_id TEXT NOT NULL,
          deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          history_json JSONB NOT NULL DEFAULT '[]'::jsonb
        )
      `
    );
    tempVoiceDeleteLogsEnsured = true;
  } catch (error) {
    console.error("Failed to ensure temp_voice_delete_logs table:", error);
  }
}

async function ensureManualVoiceSessionLogsTable() {
  if (manualVoiceSessionLogsEnsured) return;
  try {
    await query(
      `
        CREATE TABLE IF NOT EXISTS manual_voice_session_logs (
          id BIGSERIAL PRIMARY KEY,
          guild_id TEXT NOT NULL,
          channel_id TEXT NOT NULL,
          channel_name TEXT,
          owner_id TEXT NOT NULL DEFAULT 'server_owned',
          user_id TEXT NOT NULL,
          joined_at TIMESTAMPTZ NOT NULL,
          left_at TIMESTAMPTZ NOT NULL,
          total_ms BIGINT NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
    );
    manualVoiceSessionLogsEnsured = true;
  } catch (error) {
    console.error("Failed to ensure manual_voice_session_logs table:", error);
  }
}

async function ensureSetupStateTable() {
  if (setupStateEnsured) return;
  try {
    await query(
      `
        CREATE TABLE IF NOT EXISTS setup_state (
          id SMALLINT PRIMARY KEY DEFAULT 1,
          owner_discord_id TEXT,
          setup_complete BOOLEAN NOT NULL DEFAULT FALSE,
          selected_guild_id TEXT,
          log_channel_id TEXT,
          lfg_channel_id TEXT,
          bot_token_encrypted TEXT,
          bot_display_name TEXT,
          discord_client_id TEXT,
          discord_client_secret_encrypted TEXT,
          database_provider TEXT,
          database_url_encrypted TEXT,
          database_validated_at TIMESTAMPTZ,
          owner_claimed_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT setup_state_singleton CHECK (id = 1)
        )
      `
    );
    await query(
      "ALTER TABLE IF EXISTS setup_state ADD COLUMN IF NOT EXISTS bot_display_name TEXT"
    );
    await query(
      "ALTER TABLE IF EXISTS setup_state ADD COLUMN IF NOT EXISTS discord_client_id TEXT"
    );
    await query(
      "ALTER TABLE IF EXISTS setup_state ADD COLUMN IF NOT EXISTS discord_client_secret_encrypted TEXT"
    );
    setupStateEnsured = true;
  } catch (error) {
    console.error("Failed to ensure setup_state table:", error);
  }
}

function parseSetupStateRow(row: Record<string, unknown> | undefined): SetupState {
  const value = (snake: string, camel: string) => row?.[snake] ?? row?.[camel];

  return {
    ownerDiscordId: (value("owner_discord_id", "ownerDiscordId") as string | null) ?? null,
    setupComplete: Boolean(value("setup_complete", "setupComplete")),
    selectedGuildId: (value("selected_guild_id", "selectedGuildId") as string | null) ?? null,
    logChannelId: (value("log_channel_id", "logChannelId") as string | null) ?? null,
    lfgChannelId: (value("lfg_channel_id", "lfgChannelId") as string | null) ?? null,
    databaseProvider:
      value("database_provider", "databaseProvider") === "local_postgres" ||
      value("database_provider", "databaseProvider") === "local_sqlite" ||
      value("database_provider", "databaseProvider") === "supabase"
        ? (value("database_provider", "databaseProvider") as "local_postgres" | "local_sqlite" | "supabase")
        : null,
    databaseValidatedAt:
      typeof value("database_validated_at", "databaseValidatedAt") === "string"
        ? (value("database_validated_at", "databaseValidatedAt") as string)
        : null,
    botTokenSet: Boolean(
      value("bot_token_encrypted", "botTokenEncrypted")
      || value("bot_token", "botToken")
    ),
    botDisplayName: (value("bot_display_name", "botDisplayName") as string | null) ?? null,
    discordClientId: (value("discord_client_id", "discordClientId") as string | null) ?? null,
    discordClientSecretSet: Boolean(
      value("discord_client_secret_encrypted", "discordClientSecretEncrypted")
      || value("discord_client_secret", "discordClientSecret")
    ),
    databaseUrlSet: Boolean(
      value("database_url_encrypted", "databaseUrlEncrypted")
      || value("database_url", "databaseUrl")
    ),
    steps: {
      ownerClaimed: Boolean(value("owner_discord_id", "ownerDiscordId")),
      discordAppConfigured: Boolean(
        value("discord_client_id", "discordClientId")
          && (
            value("discord_client_secret_encrypted", "discordClientSecretEncrypted")
            || value("discord_client_secret", "discordClientSecret")
          )
      ),
      botTokenValidated: Boolean(
        value("bot_token_encrypted", "botTokenEncrypted")
        || value("bot_token", "botToken")
      ),
      guildValidated: Boolean(value("selected_guild_id", "selectedGuildId")),
      inviteChecked: Boolean(value("selected_guild_id", "selectedGuildId")),
      databaseValidated: Boolean(value("database_validated_at", "databaseValidatedAt")),
      channelsSaved: Boolean(value("log_channel_id", "logChannelId")),
    },
  };
}

async function ensureSetupRow() {
  if (!DATABASE_URL) {
    const current = readSetupStateFallback();
    if (!current.id) {
      writeSetupStateFallback({
        id: 1,
        setupComplete: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    return;
  }

  await ensureSetupStateTable();
  await query(
    `
      INSERT INTO setup_state (id)
      VALUES (1)
      ON CONFLICT (id) DO NOTHING
    `
  );
}

export async function getSetupState(): Promise<SetupState> {
  await ensureSetupRow();

  if (!DATABASE_URL) {
    const fallback = readSetupStateFallback();
    return parseSetupStateRow(fallback);
  }

  const res = await query(`SELECT * FROM setup_state WHERE id = 1`);
  let state = parseSetupStateRow(res.rows[0]);

  if (!state.setupComplete) {
    let existing: { guild_id?: string; log_channel_id?: string; lfg_channel_id?: string } | undefined;
    try {
      const configRes = await query(
        `
          SELECT guild_id, log_channel_id, lfg_channel_id
          FROM guild_config
          WHERE log_channel_id IS NOT NULL
          ORDER BY updated_at DESC
          LIMIT 1
        `
      );
      existing = configRes.rows[0];
    } catch (error) {
      const pgError = error as { code?: string };
      if (pgError.code !== "42P01") {
        throw error;
      }
    }

    if (existing?.guild_id) {
      await updateSetupState({
        setupComplete: true,
        ownerDiscordId: process.env.ADMIN_DISCORD_USER_ID || null,
        selectedGuildId: existing.guild_id,
        logChannelId: existing.log_channel_id,
        lfgChannelId: existing.lfg_channel_id,
      });
      const refreshed = await query(`SELECT * FROM setup_state WHERE id = 1`);
      state = parseSetupStateRow(refreshed.rows[0]);
    }
  }

  return state;
}

export async function updateSetupState(fields: {
  ownerDiscordId?: string | null;
  setupComplete?: boolean;
  selectedGuildId?: string | null;
  logChannelId?: string | null;
  lfgChannelId?: string | null;
  botTokenEncrypted?: string | null;
  botToken?: string | null;
  botDisplayName?: string | null;
  discordClientId?: string | null;
  discordClientSecretEncrypted?: string | null;
  discordClientSecret?: string | null;
  databaseProvider?: "local_postgres" | "local_sqlite" | "supabase" | null;
  databaseUrlEncrypted?: string | null;
  databaseUrl?: string | null;
  databaseValidatedAt?: string | null;
  ownerClaimedAt?: string | null;
}) {
  await ensureSetupRow();

  if (!DATABASE_URL) {
    const current = readSetupStateFallback();
    const next = {
      ...current,
      ...fields,
      updatedAt: new Date().toISOString(),
    };
    writeSetupStateFallback(next);
    return;
  }

  const keys = Object.keys(fields) as (keyof typeof fields)[];
  if (keys.length === 0) return;

  const columnByKey: Partial<Record<keyof typeof fields, string>> = {
    ownerDiscordId: "owner_discord_id",
    setupComplete: "setup_complete",
    selectedGuildId: "selected_guild_id",
    logChannelId: "log_channel_id",
    lfgChannelId: "lfg_channel_id",
    botTokenEncrypted: "bot_token_encrypted",
    botToken: undefined,
    botDisplayName: "bot_display_name",
    discordClientId: "discord_client_id",
    discordClientSecretEncrypted: "discord_client_secret_encrypted",
    discordClientSecret: undefined,
    databaseProvider: "database_provider",
    databaseUrlEncrypted: "database_url_encrypted",
    databaseUrl: undefined,
    databaseValidatedAt: "database_validated_at",
    ownerClaimedAt: "owner_claimed_at",
  };

  const assignments: string[] = [];
  const values: unknown[] = [];
  keys.forEach((key) => {
    const column = columnByKey[key];
    if (!column) return;
    assignments.push(`${column} = $${values.length + 1}`);
    values.push(fields[key]);
  });

  if (assignments.length === 0) return;

  values.push(1);
  await query(
    `
      UPDATE setup_state
      SET ${assignments.join(", ")}, updated_at = NOW()
      WHERE id = $${values.length}
    `,
    values
  );
}

export async function getSetupSecretPayload() {
  await ensureSetupRow();

  if (!DATABASE_URL) {
    const fallback = readSetupStateFallback();
    return {
      botTokenEncrypted: (fallback.botTokenEncrypted as string | null) ?? null,
      botToken: (fallback.botToken as string | null) ?? null,
      databaseUrlEncrypted: (fallback.databaseUrlEncrypted as string | null) ?? null,
      databaseUrl: (fallback.databaseUrl as string | null) ?? null,
      discordClientSecretEncrypted:
        (fallback.discordClientSecretEncrypted as string | null) ?? null,
      discordClientSecret: (fallback.discordClientSecret as string | null) ?? null,
    };
  }

  const res = await query(
    `
      SELECT bot_token_encrypted, database_url_encrypted, discord_client_secret_encrypted
      FROM setup_state
      WHERE id = 1
    `
  );

  const row = res.rows[0] ?? {};
  return {
    botTokenEncrypted: (row.bot_token_encrypted as string | null) ?? null,
    botToken: null,
    databaseUrlEncrypted: (row.database_url_encrypted as string | null) ?? null,
    databaseUrl: null,
    discordClientSecretEncrypted:
      (row.discord_client_secret_encrypted as string | null) ?? null,
    discordClientSecret: null,
  };
}

function getSetupDatabaseUrlFallback() {
  if (DATABASE_URL) return null;
  const fallback = readSetupStateFallback();
  const provider = fallback.databaseProvider;
  if (provider !== "supabase" && provider !== "local_postgres") {
    return null;
  }

  const databaseUrl = typeof fallback.databaseUrl === "string"
    ? fallback.databaseUrl.trim()
    : "";
  if (!databaseUrl) {
    return null;
  }

  return databaseUrl;
}

async function getGuildConfigWithDatabaseUrl(databaseUrl: string, guildId: string): Promise<GuildConfig> {
  const scopedPool = new Pool({
    connectionString: databaseUrl,
    ssl: buildPgSslConfig(),
  });

  const client = await scopedPool.connect();
  try {
    await client.query(
      `
        CREATE TABLE IF NOT EXISTS guild_config (
          guild_id TEXT PRIMARY KEY,
          log_channel_id TEXT,
          lfg_channel_id TEXT,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
    );
    await client.query(
      `
        CREATE TABLE IF NOT EXISTS voice_watchlist (
          id BIGSERIAL PRIMARY KEY,
          guild_id TEXT NOT NULL,
          voice_channel_id TEXT NOT NULL,
          enabled BOOLEAN NOT NULL DEFAULT TRUE
        )
      `
    );
    await client.query(
      `
        CREATE TABLE IF NOT EXISTS join_to_create_lobbies (
          id BIGSERIAL PRIMARY KEY,
          guild_id TEXT NOT NULL,
          lobby_channel_id TEXT NOT NULL,
          role_id TEXT,
          lfg_enabled BOOLEAN NOT NULL DEFAULT TRUE
        )
      `
    );

    const configRes = await client.query(
      "SELECT log_channel_id, lfg_channel_id FROM guild_config WHERE guild_id = $1",
      [guildId]
    );
    const configRow = configRes.rows[0] ?? {};

    const watchlistRes = await client.query(
      "SELECT voice_channel_id FROM voice_watchlist WHERE guild_id = $1 AND enabled = true",
      [guildId]
    );

    let lobbyRes;
    try {
      lobbyRes = await client.query(
        "SELECT lobby_channel_id, role_id, lfg_enabled FROM join_to_create_lobbies WHERE guild_id = $1",
        [guildId]
      );
    } catch (error) {
      const pgError = error as { code?: string };
      if (pgError.code !== "42703") throw error;
      lobbyRes = await client.query(
        "SELECT lobby_channel_id, role_id FROM join_to_create_lobbies WHERE guild_id = $1",
        [guildId]
      );
    }

    return {
      logChannelId: configRow.log_channel_id ?? null,
      lfgChannelId: configRow.lfg_channel_id ?? null,
      enabledVoiceChannelIds: watchlistRes.rows.map(
        (row) => row.voice_channel_id
      ),
      joinToCreateLobbies: lobbyRes.rows.map((row) => ({
        channelId: row.lobby_channel_id,
        roleId: row.role_id ?? null,
        lfgEnabled: row.lfg_enabled ?? true,
      })),
    };
  } finally {
    client.release();
    await scopedPool.end().catch(() => null);
  }
}

export async function getGuildConfig(guildId: string): Promise<GuildConfig> {
  if (!DATABASE_URL) {
    const setupDatabaseUrl = getSetupDatabaseUrlFallback();
    if (setupDatabaseUrl) {
      return getGuildConfigWithDatabaseUrl(setupDatabaseUrl, guildId);
    }

    const db = getSqliteDb();
    const configRow = db
      .prepare(
        "SELECT log_channel_id, lfg_channel_id FROM guild_config WHERE guild_id = ?"
      )
      .get(guildId) as { log_channel_id?: string | null; lfg_channel_id?: string | null } | undefined;

    const watchRows = db
      .prepare(
        "SELECT voice_channel_id FROM voice_watchlist WHERE guild_id = ? AND enabled = 1"
      )
      .all(guildId) as { voice_channel_id: string }[];

    const lobbyRows = db
      .prepare(
        "SELECT lobby_channel_id, role_id, lfg_enabled FROM join_to_create_lobbies WHERE guild_id = ?"
      )
      .all(guildId) as { lobby_channel_id: string; role_id?: string | null; lfg_enabled?: number }[];

    return {
      logChannelId: configRow?.log_channel_id ?? null,
      lfgChannelId: configRow?.lfg_channel_id ?? null,
      enabledVoiceChannelIds: watchRows.map((row) => row.voice_channel_id),
      joinToCreateLobbies: lobbyRows.map((row) => ({
        channelId: row.lobby_channel_id,
        roleId: row.role_id ?? null,
        lfgEnabled: row.lfg_enabled !== 0,
      })),
    };
  }

  await ensureCoreConfigTables();
  await ensureJoinToCreateLfgEnabledColumn();
  const configRes = await query(
    "SELECT log_channel_id, lfg_channel_id FROM guild_config WHERE guild_id = $1",
    [guildId]
  );
  const configRow = configRes.rows[0] ?? {};

  const watchlistRes = await query(
    "SELECT voice_channel_id FROM voice_watchlist WHERE guild_id = $1 AND enabled = true",
    [guildId]
  );

  let lobbyRes;
  try {
    lobbyRes = await query(
      "SELECT lobby_channel_id, role_id, lfg_enabled FROM join_to_create_lobbies WHERE guild_id = $1",
      [guildId]
    );
  } catch (error) {
    const pgError = error as { code?: string };
    if (pgError.code !== "42703") throw error;
    lobbyRes = await query(
      "SELECT lobby_channel_id, role_id FROM join_to_create_lobbies WHERE guild_id = $1",
      [guildId]
    );
  }

  return {
    logChannelId: configRow.log_channel_id ?? null,
    lfgChannelId: configRow.lfg_channel_id ?? null,
    enabledVoiceChannelIds: watchlistRes.rows.map(
      (row) => row.voice_channel_id
    ),
    joinToCreateLobbies: lobbyRes.rows.map((row) => ({
      channelId: row.lobby_channel_id,
      roleId: row.role_id ?? null,
      lfgEnabled: row.lfg_enabled ?? true,
    })),
  };
}

async function saveGuildConfigWithClient(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  guildId: string,
  config: GuildConfig
) {
  if (!config.logChannelId) {
    throw new Error("logChannelId is required");
  }
  if (config.joinToCreateLobbies.some((item) => !item.roleId)) {
    throw new Error("joinToCreateLobbies requires a role for each lobby");
  }

  const lfgEnabledColumnRes = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'join_to_create_lobbies'
          AND column_name = 'lfg_enabled'
      ) AS has_lfg_enabled
    `
  );
  const hasLfgEnabledColumn = lfgEnabledColumnRes.rows[0]?.has_lfg_enabled === true;

  await client.query(
    `
      INSERT INTO guild_config (guild_id, log_channel_id, lfg_channel_id, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT(guild_id) DO UPDATE SET
        log_channel_id = EXCLUDED.log_channel_id,
        lfg_channel_id = EXCLUDED.lfg_channel_id,
        updated_at = EXCLUDED.updated_at
    `,
    [guildId, config.logChannelId, config.lfgChannelId]
  );

  await client.query("DELETE FROM voice_watchlist WHERE guild_id = $1", [guildId]);
  for (const channelId of config.enabledVoiceChannelIds) {
    await client.query(
      "INSERT INTO voice_watchlist (guild_id, voice_channel_id, enabled) VALUES ($1, $2, true)",
      [guildId, channelId]
    );
  }

  await client.query("DELETE FROM join_to_create_lobbies WHERE guild_id = $1", [guildId]);
  for (const lobby of config.joinToCreateLobbies) {
    if (hasLfgEnabledColumn) {
      await client.query(
        "INSERT INTO join_to_create_lobbies (guild_id, lobby_channel_id, role_id, lfg_enabled) VALUES ($1, $2, $3, $4)",
        [guildId, lobby.channelId, lobby.roleId, lobby.lfgEnabled ?? true]
      );
    } else {
      await client.query(
        "INSERT INTO join_to_create_lobbies (guild_id, lobby_channel_id, role_id) VALUES ($1, $2, $3)",
        [guildId, lobby.channelId, lobby.roleId]
      );
    }
  }
}

async function runDeleteIgnoreMissingTable(
  client: { query: (text: string, params?: unknown[]) => Promise<unknown> },
  sql: string,
  params: unknown[]
) {
  try {
    await client.query(sql, params);
  } catch (error) {
    const pgError = error as { code?: string };
    if (pgError.code === "42P01") {
      return;
    }
    throw error;
  }
}

function runSqliteDeleteIgnoreMissingTable(db: SqliteDatabase, sql: string, args: unknown[]) {
  try {
    db.prepare(sql).run(...args);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.toLowerCase().includes("no such table")) {
      return;
    }
    throw error;
  }
}

async function clearGuildSettingsWithClient(
  client: { query: (text: string, params?: unknown[]) => Promise<unknown> },
  guildId: string
) {
  await runDeleteIgnoreMissingTable(
    client,
    "DELETE FROM join_to_create_lobbies WHERE guild_id = $1",
    [guildId]
  );
  await runDeleteIgnoreMissingTable(
    client,
    "DELETE FROM voice_watchlist WHERE guild_id = $1",
    [guildId]
  );
  await runDeleteIgnoreMissingTable(
    client,
    "DELETE FROM lfg_persistent_message WHERE guild_id = $1",
    [guildId]
  );
  await runDeleteIgnoreMissingTable(
    client,
    "DELETE FROM guild_config WHERE guild_id = $1",
    [guildId]
  );
}

export async function clearGuildSettings(guildId: string) {
  const targetGuildId = guildId.trim();
  if (!targetGuildId) return;

  if (!DATABASE_URL) {
    const setupDatabaseUrl = getSetupDatabaseUrlFallback();
    if (setupDatabaseUrl) {
      const scopedPool = new Pool({
        connectionString: setupDatabaseUrl,
        ssl: buildPgSslConfig(),
      });
      const client = await scopedPool.connect();
      try {
        await client.query("BEGIN");
        await clearGuildSettingsWithClient(client, targetGuildId);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
        await scopedPool.end().catch(() => null);
      }
      return;
    }

    const db = getSqliteDb();
    const tx = db.transaction(() => {
      runSqliteDeleteIgnoreMissingTable(
        db,
        "DELETE FROM join_to_create_lobbies WHERE guild_id = ?",
        [targetGuildId]
      );
      runSqliteDeleteIgnoreMissingTable(
        db,
        "DELETE FROM voice_watchlist WHERE guild_id = ?",
        [targetGuildId]
      );
      runSqliteDeleteIgnoreMissingTable(
        db,
        "DELETE FROM lfg_persistent_message WHERE guild_id = ?",
        [targetGuildId]
      );
      runSqliteDeleteIgnoreMissingTable(
        db,
        "DELETE FROM guild_config WHERE guild_id = ?",
        [targetGuildId]
      );
    });
    tx();
    return;
  }

  const db = await getPool();
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await clearGuildSettingsWithClient(client, targetGuildId);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function saveGuildConfig(guildId: string, config: GuildConfig) {
  if (!DATABASE_URL) {
    const setupDatabaseUrl = getSetupDatabaseUrlFallback();
    if (setupDatabaseUrl) {
      await saveGuildConfigWithDatabaseUrl(setupDatabaseUrl, guildId, config);
      return;
    }

    const db = getSqliteDb();
    const now = new Date().toISOString();
    const tx = db.transaction(() => {
      if (!config.logChannelId) {
        throw new Error("logChannelId is required");
      }
      if (config.joinToCreateLobbies.some((item) => !item.roleId)) {
        throw new Error("joinToCreateLobbies requires a role for each lobby");
      }

      db.prepare(
        `
          INSERT INTO guild_config (guild_id, log_channel_id, lfg_channel_id, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET
            log_channel_id = excluded.log_channel_id,
            lfg_channel_id = excluded.lfg_channel_id,
            updated_at = excluded.updated_at
        `
      ).run(guildId, config.logChannelId, config.lfgChannelId, now);

      db.prepare("DELETE FROM voice_watchlist WHERE guild_id = ?").run(guildId);
      for (const channelId of config.enabledVoiceChannelIds) {
        db.prepare(
          "INSERT INTO voice_watchlist (guild_id, voice_channel_id, enabled) VALUES (?, ?, 1)"
        ).run(guildId, channelId);
      }

      db.prepare("DELETE FROM join_to_create_lobbies WHERE guild_id = ?").run(guildId);
      for (const lobby of config.joinToCreateLobbies) {
        db.prepare(
          "INSERT INTO join_to_create_lobbies (guild_id, lobby_channel_id, role_id, lfg_enabled) VALUES (?, ?, ?, ?)"
        ).run(guildId, lobby.channelId, lobby.roleId, lobby.lfgEnabled ? 1 : 0);
      }
    });

    tx();
    return;
  }

  await ensureCoreConfigTables();
  await ensureJoinToCreateLfgEnabledColumn();
  const db = await getPool();
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await saveGuildConfigWithClient(client, guildId, config);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function saveGuildConfigWithDatabaseUrl(
  databaseUrl: string,
  guildId: string,
  config: GuildConfig
) {
  const scopedPool = new Pool({
    connectionString: databaseUrl,
    ssl: buildPgSslConfig(),
  });
  const client = await scopedPool.connect();
  try {
    await client.query(
      `
        CREATE TABLE IF NOT EXISTS guild_config (
          guild_id TEXT PRIMARY KEY,
          log_channel_id TEXT,
          lfg_channel_id TEXT,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
    );
    await client.query(
      `
        CREATE TABLE IF NOT EXISTS voice_watchlist (
          id BIGSERIAL PRIMARY KEY,
          guild_id TEXT NOT NULL,
          voice_channel_id TEXT NOT NULL,
          enabled BOOLEAN NOT NULL DEFAULT TRUE
        )
      `
    );
    await client.query(
      `
        CREATE TABLE IF NOT EXISTS join_to_create_lobbies (
          id BIGSERIAL PRIMARY KEY,
          guild_id TEXT NOT NULL,
          lobby_channel_id TEXT NOT NULL,
          role_id TEXT,
          lfg_enabled BOOLEAN NOT NULL DEFAULT TRUE
        )
      `
    );
    await client.query("BEGIN");
    await saveGuildConfigWithClient(client, guildId, config);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await scopedPool.end().catch(() => null);
  }
}

async function getTempChannelsWithDatabaseUrl(databaseUrl: string, guildId: string) {
  const scopedPool = new Pool({
    connectionString: databaseUrl,
    ssl: buildPgSslConfig(),
  });
  const client = await scopedPool.connect();
  try {
    await client.query(
      `
        CREATE TABLE IF NOT EXISTS temp_voice_channels (
          channel_id TEXT PRIMARY KEY,
          guild_id TEXT NOT NULL,
          owner_id TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL,
          lfg_channel_id TEXT,
          lfg_message_id TEXT,
          role_id TEXT,
          lfg_enabled BOOLEAN NOT NULL DEFAULT TRUE
        )
      `
    );

    let res;
    try {
      res = await client.query(
        `
          SELECT
            tc.channel_id,
            tc.owner_id,
            tc.created_at,
            tc.lfg_channel_id,
            tc.lfg_message_id,
            COALESCE(
              json_agg(
                json_build_object('userId', ta.user_id, 'joinedAt', ta.joined_at)
                ORDER BY ta.joined_at DESC
              ) FILTER (WHERE ta.user_id IS NOT NULL),
              '[]'::json
            ) AS active_users
          FROM temp_voice_channels tc
          LEFT JOIN temp_voice_activity ta
            ON ta.channel_id = tc.channel_id
           AND ta.is_active = TRUE
          WHERE tc.guild_id = $1
          GROUP BY tc.channel_id, tc.owner_id, tc.created_at, tc.lfg_channel_id, tc.lfg_message_id
          ORDER BY tc.created_at DESC
        `,
        [guildId]
      );
    } catch (error) {
      const pgError = error as { code?: string };
      if (pgError.code !== "42P01") {
        throw error;
      }
      res = await client.query(
        `
          SELECT
            channel_id,
            owner_id,
            created_at,
            lfg_channel_id,
            lfg_message_id,
            '[]'::json AS active_users
          FROM temp_voice_channels
          WHERE guild_id = $1
          ORDER BY created_at DESC
        `,
        [guildId]
      );
    }

    return res.rows as {
      channel_id: string;
      owner_id: string;
      created_at: string;
      lfg_channel_id: string | null;
      lfg_message_id: string | null;
      active_users: unknown;
    }[];
  } finally {
    client.release();
    await scopedPool.end().catch(() => null);
  }
}

export async function getTempChannels(guildId: string) {
  if (!DATABASE_URL) {
    const setupDatabaseUrl = getSetupDatabaseUrlFallback();
    if (setupDatabaseUrl) {
      return getTempChannelsWithDatabaseUrl(setupDatabaseUrl, guildId);
    }

    const db = getSqliteDb();
    let rows;
    try {
      rows = db
        .prepare(
          `
            SELECT
              tc.channel_id,
              tc.owner_id,
              tc.created_at,
              tc.lfg_channel_id,
              tc.lfg_message_id,
              COALESCE(
                json_group_array(
                  CASE
                    WHEN ta.user_id IS NOT NULL THEN json_object('userId', ta.user_id, 'joinedAt', ta.joined_at)
                    ELSE NULL
                  END
                ),
                '[]'
              ) AS active_users
            FROM temp_voice_channels tc
            LEFT JOIN temp_voice_activity ta
              ON ta.channel_id = tc.channel_id
             AND ta.is_active = 1
            WHERE tc.guild_id = ?
            GROUP BY tc.channel_id, tc.owner_id, tc.created_at, tc.lfg_channel_id, tc.lfg_message_id
            ORDER BY tc.created_at DESC
          `
        )
        .all(guildId) as {
        channel_id: string;
        owner_id: string;
        created_at: string;
        lfg_channel_id: string | null;
        lfg_message_id: string | null;
        active_users: unknown;
      }[];
    } catch {
      rows = db
        .prepare(
          `
            SELECT
              channel_id,
              owner_id,
              created_at,
              lfg_channel_id,
              lfg_message_id,
              '[]' AS active_users
            FROM temp_voice_channels
            WHERE guild_id = ?
            ORDER BY created_at DESC
          `
        )
        .all(guildId) as {
        channel_id: string;
        owner_id: string;
        created_at: string;
        lfg_channel_id: string | null;
        lfg_message_id: string | null;
        active_users: unknown;
      }[];
    }
    return rows;
  }

  const res = await query(
    `
      SELECT
        tc.channel_id,
        tc.owner_id,
        tc.created_at,
        tc.lfg_channel_id,
        tc.lfg_message_id,
        COALESCE(
          json_agg(
            json_build_object('userId', ta.user_id, 'joinedAt', ta.joined_at)
            ORDER BY ta.joined_at DESC
          ) FILTER (WHERE ta.user_id IS NOT NULL),
          '[]'::json
        ) AS active_users
      FROM temp_voice_channels tc
      LEFT JOIN temp_voice_activity ta
        ON ta.channel_id = tc.channel_id
       AND ta.is_active = TRUE
      WHERE tc.guild_id = $1
      GROUP BY tc.channel_id, tc.owner_id, tc.created_at, tc.lfg_channel_id, tc.lfg_message_id
      ORDER BY tc.created_at DESC
    `,
    [guildId]
  );
  return res.rows as {
    channel_id: string;
    owner_id: string;
    created_at: string;
    lfg_channel_id: string | null;
    lfg_message_id: string | null;
    active_users: unknown;
  }[];
}

export async function deleteTempChannelRecord(channelId: string) {
  if (!DATABASE_URL) {
    const setupDatabaseUrl = getSetupDatabaseUrlFallback();
    if (setupDatabaseUrl) {
      const scopedPool = new Pool({
        connectionString: setupDatabaseUrl,
        ssl: buildPgSslConfig(),
      });
      const client = await scopedPool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM temp_voice_activity WHERE channel_id = $1", [channelId]);
        await client.query("DELETE FROM temp_voice_channels WHERE channel_id = $1", [channelId]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
        await scopedPool.end().catch(() => null);
      }
      return;
    }

    const db = getSqliteDb();
    const tx = db.transaction((id: string) => {
      try {
        db.prepare("DELETE FROM temp_voice_activity WHERE channel_id = ?").run(id);
      } catch {
        // temp_voice_activity may not exist in older local setups
      }
      db.prepare("DELETE FROM temp_voice_channels WHERE channel_id = ?").run(id);
    });
    tx(channelId);
    return;
  }

  const db = await getPool();
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM temp_voice_activity WHERE channel_id = $1", [channelId]);
    await client.query("DELETE FROM temp_voice_channels WHERE channel_id = $1", [channelId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

type DeleteLogRow = {
  row_id: string | number;
  source_type: "temp_deleted" | "manual_session";
  channel_id: string;
  channel_name: string | null;
  owner_id: string;
  event_at: string;
  joined_at: string | null;
  left_at: string | null;
  history_json: unknown;
};

export async function getTempVoiceDeleteLogs(
  guildId: string,
  limit = 100,
  offset = 0
) {
  if (!DATABASE_URL) {
    const setupDatabaseUrl = getSetupDatabaseUrlFallback();
    if (setupDatabaseUrl) {
      const scopedPool = new Pool({
        connectionString: setupDatabaseUrl,
        ssl: buildPgSslConfig(),
      });
      const client = await scopedPool.connect();
      try {
        await client.query(
          `
            CREATE TABLE IF NOT EXISTS temp_voice_delete_logs (
              id BIGSERIAL PRIMARY KEY,
              guild_id TEXT NOT NULL,
              channel_id TEXT NOT NULL,
              channel_name TEXT,
              owner_id TEXT NOT NULL,
              deleted_at TIMESTAMPTZ NOT NULL,
              history_json JSONB NOT NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
          `
        );
        await client.query(
          `
            CREATE TABLE IF NOT EXISTS manual_voice_session_logs (
              id BIGSERIAL PRIMARY KEY,
              guild_id TEXT NOT NULL,
              channel_id TEXT NOT NULL,
              channel_name TEXT,
              owner_id TEXT NOT NULL,
              user_id TEXT NOT NULL,
              joined_at TIMESTAMPTZ NOT NULL,
              left_at TIMESTAMPTZ NOT NULL,
              total_ms BIGINT NOT NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
          `
        );

        const safeLimit = Number.isFinite(limit)
          ? Math.min(200, Math.max(1, Math.floor(limit)))
          : 100;
        const safeOffset = Number.isFinite(offset)
          ? Math.max(0, Math.floor(offset))
          : 0;

        const res = await client.query(
          `
            SELECT
              source_type,
              row_id,
              channel_id,
              channel_name,
              owner_id,
              event_at,
              joined_at,
              left_at,
              history_json
            FROM (
              SELECT
                'temp_deleted'::text AS source_type,
                id AS row_id,
                channel_id,
                channel_name,
                owner_id,
                deleted_at AS event_at,
                NULL::timestamptz AS joined_at,
                NULL::timestamptz AS left_at,
                history_json
              FROM temp_voice_delete_logs
              WHERE guild_id = $1

              UNION ALL

              SELECT
                'manual_session'::text AS source_type,
                id AS row_id,
                channel_id,
                channel_name,
                owner_id,
                left_at AS event_at,
                joined_at,
                left_at,
                jsonb_build_array(
                  jsonb_build_object('userId', user_id, 'totalMs', total_ms)
                ) AS history_json
              FROM manual_voice_session_logs
              WHERE guild_id = $1
            ) combined
            ORDER BY event_at DESC
            LIMIT $2
            OFFSET $3
          `,
          [guildId, safeLimit, safeOffset]
        );

        return (res.rows as DeleteLogRow[]).map((row) => {
          const rawHistory = Array.isArray(row.history_json) ? row.history_json : [];
          const history = rawHistory
            .map((item) => {
              if (!item || typeof item !== "object") return null;
              const value = item as { userId?: unknown; totalMs?: unknown };
              if (typeof value.userId !== "string") return null;
              return {
                userId: value.userId,
                totalMs: Number(value.totalMs ?? 0),
              };
            })
            .filter((item): item is { userId: string; totalMs: number } => item !== null);

          return {
            id: `${row.source_type}:${String(row.row_id)}`,
            sourceType: row.source_type,
            label:
              row.source_type === "manual_session"
                ? "Manual Voice Session"
                : "Temp Deleted",
            channelId: row.channel_id,
            channelName: row.channel_name,
            ownerId: row.owner_id,
            eventAt: row.event_at,
            joinedAt: row.joined_at,
            leftAt: row.left_at,
            history,
          };
        });
      } finally {
        client.release();
        await scopedPool.end().catch(() => null);
      }
    }

    const safeLimit = Number.isFinite(limit)
      ? Math.min(200, Math.max(1, Math.floor(limit)))
      : 100;
    const safeOffset = Number.isFinite(offset)
      ? Math.max(0, Math.floor(offset))
      : 0;

    const db = getSqliteDb();
    const rows = db
      .prepare(
        `
          SELECT
            source_type,
            row_id,
            channel_id,
            channel_name,
            owner_id,
            event_at,
            joined_at,
            left_at,
            history_json
          FROM (
            SELECT
              'temp_deleted' AS source_type,
              id AS row_id,
              channel_id,
              channel_name,
              owner_id,
              deleted_at AS event_at,
              NULL AS joined_at,
              NULL AS left_at,
              history_json
            FROM temp_voice_delete_logs
            WHERE guild_id = ?

            UNION ALL

            SELECT
              'manual_session' AS source_type,
              id AS row_id,
              channel_id,
              channel_name,
              owner_id,
              left_at AS event_at,
              joined_at,
              left_at,
              json_array(json_object('userId', user_id, 'totalMs', total_ms)) AS history_json
            FROM manual_voice_session_logs
            WHERE guild_id = ?
          ) combined
          ORDER BY event_at DESC
          LIMIT ?
          OFFSET ?
        `
      )
      .all(guildId, guildId, safeLimit, safeOffset) as {
      source_type: "temp_deleted" | "manual_session";
      row_id: number | string;
      channel_id: string;
      channel_name: string | null;
      owner_id: string;
      event_at: string;
      joined_at: string | null;
      left_at: string | null;
      history_json: unknown;
    }[];

    return rows.map((row) => {
      const parsedHistory = (() => {
        if (Array.isArray(row.history_json)) return row.history_json;
        if (typeof row.history_json === "string") {
          try {
            const parsed = JSON.parse(row.history_json) as unknown;
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        }
        return [];
      })();

      const history = parsedHistory
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const value = item as { userId?: unknown; totalMs?: unknown };
          if (typeof value.userId !== "string") return null;
          return {
            userId: value.userId,
            totalMs: Number(value.totalMs ?? 0),
          };
        })
        .filter((item): item is { userId: string; totalMs: number } => item !== null);

      return {
        id: `${row.source_type}:${String(row.row_id)}`,
        sourceType: row.source_type,
        label:
          row.source_type === "manual_session"
            ? "Manual Voice Session"
            : "Temp Deleted",
        channelId: row.channel_id,
        channelName: row.channel_name,
        ownerId: row.owner_id,
        eventAt: row.event_at,
        joinedAt: row.joined_at,
        leftAt: row.left_at,
        history,
      };
    });
  }

  await ensureTempVoiceDeleteLogsTable();
  await ensureManualVoiceSessionLogsTable();
  const safeLimit = Number.isFinite(limit)
    ? Math.min(200, Math.max(1, Math.floor(limit)))
    : 100;
  const safeOffset = Number.isFinite(offset)
    ? Math.max(0, Math.floor(offset))
    : 0;

  const res = await query(
    `
      SELECT
        source_type,
        row_id,
        channel_id,
        channel_name,
        owner_id,
        event_at,
        joined_at,
        left_at,
        history_json
      FROM (
        SELECT
          'temp_deleted'::text AS source_type,
          id AS row_id,
          channel_id,
          channel_name,
          owner_id,
          deleted_at AS event_at,
          NULL::timestamptz AS joined_at,
          NULL::timestamptz AS left_at,
          history_json
        FROM temp_voice_delete_logs
        WHERE guild_id = $1

        UNION ALL

        SELECT
          'manual_session'::text AS source_type,
          id AS row_id,
          channel_id,
          channel_name,
          owner_id,
          left_at AS event_at,
          joined_at,
          left_at,
          jsonb_build_array(
            jsonb_build_object('userId', user_id, 'totalMs', total_ms)
          ) AS history_json
        FROM manual_voice_session_logs
        WHERE guild_id = $1
      ) combined
      ORDER BY event_at DESC
      LIMIT $2
      OFFSET $3
    `,
    [guildId, safeLimit, safeOffset]
  );

  return (res.rows as DeleteLogRow[]).map((row) => {
    const rawHistory = Array.isArray(row.history_json) ? row.history_json : [];
    const history = rawHistory
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const value = item as { userId?: unknown; totalMs?: unknown };
        if (typeof value.userId !== "string") return null;
        return {
          userId: value.userId,
          totalMs: Number(value.totalMs ?? 0),
        };
      })
      .filter((item): item is { userId: string; totalMs: number } => item !== null);

    return {
      id: `${row.source_type}:${String(row.row_id)}`,
      sourceType: row.source_type,
      label:
        row.source_type === "manual_session"
          ? "Manual Voice Session"
          : "Temp Deleted",
      channelId: row.channel_id,
      channelName: row.channel_name,
      ownerId: row.owner_id,
      eventAt: row.event_at,
      joinedAt: row.joined_at,
      leftAt: row.left_at,
      history,
    };
  });
}

type DeleteLeaderboardRow = {
  user_id: string;
  total_ms: string | number;
  sessions: string | number;
};

export async function getTempVoiceDeleteLeaderboard(
  guildId: string,
  limit = 20,
  offset = 0
) {
  if (!DATABASE_URL) {
    const setupDatabaseUrl = getSetupDatabaseUrlFallback();
    if (setupDatabaseUrl) {
      const scopedPool = new Pool({
        connectionString: setupDatabaseUrl,
        ssl: buildPgSslConfig(),
      });
      const client = await scopedPool.connect();
      try {
        await client.query(
          `
            CREATE TABLE IF NOT EXISTS temp_voice_delete_logs (
              id BIGSERIAL PRIMARY KEY,
              guild_id TEXT NOT NULL,
              channel_id TEXT NOT NULL,
              channel_name TEXT,
              owner_id TEXT NOT NULL,
              deleted_at TIMESTAMPTZ NOT NULL,
              history_json JSONB NOT NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
          `
        );
        await client.query(
          `
            CREATE TABLE IF NOT EXISTS manual_voice_session_logs (
              id BIGSERIAL PRIMARY KEY,
              guild_id TEXT NOT NULL,
              channel_id TEXT NOT NULL,
              channel_name TEXT,
              owner_id TEXT NOT NULL,
              user_id TEXT NOT NULL,
              joined_at TIMESTAMPTZ NOT NULL,
              left_at TIMESTAMPTZ NOT NULL,
              total_ms BIGINT NOT NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
          `
        );

        const safeLimit = Number.isFinite(limit)
          ? Math.min(200, Math.max(1, Math.floor(limit)))
          : 20;
        const safeOffset = Number.isFinite(offset)
          ? Math.max(0, Math.floor(offset))
          : 0;

        const res = await client.query(
          `
            WITH temp_expanded AS (
              SELECT
                elem->>'userId' AS user_id,
                CASE
                  WHEN (elem->>'totalMs') ~ '^[0-9]+$'
                    THEN (elem->>'totalMs')::bigint
                  ELSE 0
                END AS total_ms
              FROM temp_voice_delete_logs logs
              CROSS JOIN LATERAL jsonb_array_elements(logs.history_json) elem
              WHERE logs.guild_id = $1
                AND elem ? 'userId'
            ),
            all_sessions AS (
              SELECT user_id, total_ms FROM temp_expanded
              UNION ALL
              SELECT user_id, total_ms
              FROM manual_voice_session_logs
              WHERE guild_id = $1
            )
            SELECT
              user_id,
              SUM(total_ms)::bigint AS total_ms,
              COUNT(*)::bigint AS sessions
            FROM all_sessions
            GROUP BY user_id
            ORDER BY total_ms DESC, sessions DESC, user_id ASC
            LIMIT $2
            OFFSET $3
          `,
          [guildId, safeLimit, safeOffset]
        );

        return (res.rows as DeleteLeaderboardRow[]).map((row) => ({
          userId: row.user_id,
          totalMs: Number(row.total_ms ?? 0),
          sessions: Number(row.sessions ?? 0),
        }));
      } finally {
        client.release();
        await scopedPool.end().catch(() => null);
      }
    }

    const safeLimit = Number.isFinite(limit)
      ? Math.min(200, Math.max(1, Math.floor(limit)))
      : 20;
    const safeOffset = Number.isFinite(offset)
      ? Math.max(0, Math.floor(offset))
      : 0;

    const db = getSqliteDb();
    const aggregate = new Map<string, { totalMs: number; sessions: number }>();

    const tempRows = db
      .prepare(
        `
          SELECT history_json
          FROM temp_voice_delete_logs
          WHERE guild_id = ?
        `
      )
      .all(guildId) as { history_json: unknown }[];

    for (const row of tempRows) {
      let parsedHistory: unknown[] = [];
      if (Array.isArray(row.history_json)) {
        parsedHistory = row.history_json;
      } else if (typeof row.history_json === "string") {
        try {
          const parsed = JSON.parse(row.history_json) as unknown;
          parsedHistory = Array.isArray(parsed) ? parsed : [];
        } catch {
          parsedHistory = [];
        }
      }

      for (const item of parsedHistory) {
        if (!item || typeof item !== "object") continue;
        const value = item as { userId?: unknown; totalMs?: unknown };
        if (typeof value.userId !== "string") continue;
        const current = aggregate.get(value.userId) ?? { totalMs: 0, sessions: 0 };
        current.totalMs += Math.max(0, Number(value.totalMs) || 0);
        current.sessions += 1;
        aggregate.set(value.userId, current);
      }
    }

    const manualRows = db
      .prepare(
        `
          SELECT user_id, total_ms
          FROM manual_voice_session_logs
          WHERE guild_id = ?
        `
      )
      .all(guildId) as { user_id: string; total_ms: number }[];

    for (const row of manualRows) {
      const current = aggregate.get(row.user_id) ?? { totalMs: 0, sessions: 0 };
      current.totalMs += Math.max(0, Number(row.total_ms) || 0);
      current.sessions += 1;
      aggregate.set(row.user_id, current);
    }

    return [...aggregate.entries()]
      .map(([userId, stats]) => ({
        userId,
        totalMs: stats.totalMs,
        sessions: stats.sessions,
      }))
      .sort((a, b) => {
        if (b.totalMs !== a.totalMs) return b.totalMs - a.totalMs;
        if (b.sessions !== a.sessions) return b.sessions - a.sessions;
        return a.userId.localeCompare(b.userId);
      })
      .slice(safeOffset, safeOffset + safeLimit);
  }

  await ensureTempVoiceDeleteLogsTable();
  await ensureManualVoiceSessionLogsTable();
  const safeLimit = Number.isFinite(limit)
    ? Math.min(200, Math.max(1, Math.floor(limit)))
    : 20;
  const safeOffset = Number.isFinite(offset)
    ? Math.max(0, Math.floor(offset))
    : 0;

  const res = await query(
    `
      WITH temp_expanded AS (
        SELECT
          elem->>'userId' AS user_id,
          CASE
            WHEN (elem->>'totalMs') ~ '^[0-9]+$'
              THEN (elem->>'totalMs')::bigint
            ELSE 0
          END AS total_ms
        FROM temp_voice_delete_logs logs
        CROSS JOIN LATERAL jsonb_array_elements(logs.history_json) elem
        WHERE logs.guild_id = $1
          AND elem ? 'userId'
      ),
      all_sessions AS (
        SELECT user_id, total_ms FROM temp_expanded
        UNION ALL
        SELECT user_id, total_ms
        FROM manual_voice_session_logs
        WHERE guild_id = $1
      )
      SELECT
        user_id,
        SUM(total_ms)::bigint AS total_ms,
        COUNT(*)::bigint AS sessions
      FROM all_sessions
      GROUP BY user_id
      ORDER BY total_ms DESC, sessions DESC, user_id ASC
      LIMIT $2
      OFFSET $3
    `,
    [guildId, safeLimit, safeOffset]
  );

  return (res.rows as DeleteLeaderboardRow[]).map((row) => ({
    userId: row.user_id,
    totalMs: Number(row.total_ms ?? 0),
    sessions: Number(row.sessions ?? 0),
  }));
}
