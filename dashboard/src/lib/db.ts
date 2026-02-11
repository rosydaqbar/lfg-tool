import "@/lib/env";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

type GuildConfig = {
  logChannelId: string | null;
  lfgChannelId: string | null;
  enabledVoiceChannelIds: string[];
  joinToCreateLobbyIds: string[];
};

let db: Database.Database | null = null;

function getDatabasePath() {
  const repoRoot = path.resolve(process.cwd(), "..");
  const envPath = process.env.DATABASE_PATH;
  if (envPath) return path.resolve(repoRoot, envPath);
  return path.resolve(repoRoot, "data", "discord.db");
}

function initDb() {
  const dbPath = getDatabasePath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const instance = new Database(dbPath);
  instance.pragma("journal_mode = WAL");
  instance.exec(`
    CREATE TABLE IF NOT EXISTS guild_config (
      guild_id TEXT PRIMARY KEY,
      log_channel_id TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS voice_watchlist (
      guild_id TEXT NOT NULL,
      voice_channel_id TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      PRIMARY KEY (guild_id, voice_channel_id)
    );
    CREATE TABLE IF NOT EXISTS join_to_create_lobbies (
      guild_id TEXT NOT NULL,
      lobby_channel_id TEXT NOT NULL,
      PRIMARY KEY (guild_id, lobby_channel_id)
    );
    CREATE TABLE IF NOT EXISTS temp_voice_channels (
      guild_id TEXT NOT NULL,
      channel_id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      lfg_channel_id TEXT,
      lfg_message_id TEXT
    );
    CREATE TABLE IF NOT EXISTS lfg_persistent_message (
      guild_id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS process_metrics (
      service TEXT PRIMARY KEY,
      pid INTEGER NOT NULL,
      cpu_percent REAL NOT NULL,
      memory_rss INTEGER NOT NULL,
      memory_heap_used INTEGER NOT NULL,
      memory_heap_total INTEGER NOT NULL,
      uptime_seconds INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const tempColumns = instance
    .prepare("PRAGMA table_info(temp_voice_channels)")
    .all()
    .map((column) => column.name as string);
  if (!tempColumns.includes("lfg_channel_id")) {
    instance.exec("ALTER TABLE temp_voice_channels ADD COLUMN lfg_channel_id TEXT");
  }
  if (!tempColumns.includes("lfg_message_id")) {
    instance.exec("ALTER TABLE temp_voice_channels ADD COLUMN lfg_message_id TEXT");
  }

  const configColumns = instance
    .prepare("PRAGMA table_info(guild_config)")
    .all()
    .map((column) => column.name as string);
  if (!configColumns.includes("lfg_channel_id")) {
    instance.exec("ALTER TABLE guild_config ADD COLUMN lfg_channel_id TEXT");
  }
  return instance;
}

export function getDb() {
  if (!db) db = initDb();
  return db;
}

export function getGuildConfig(guildId: string): GuildConfig {
  const database = getDb();
  const configRow = database
    .prepare(
      "SELECT log_channel_id, lfg_channel_id FROM guild_config WHERE guild_id = ?"
    )
    .get(guildId) as
    | { log_channel_id?: string; lfg_channel_id?: string }
    | undefined;

  const watchlistRows = database
    .prepare(
      "SELECT voice_channel_id FROM voice_watchlist WHERE guild_id = ? AND enabled = 1"
    )
    .all(guildId) as { voice_channel_id: string }[];

  const lobbyRows = database
    .prepare(
      "SELECT lobby_channel_id FROM join_to_create_lobbies WHERE guild_id = ?"
    )
    .all(guildId) as { lobby_channel_id: string }[];

  return {
    logChannelId: configRow?.log_channel_id ?? null,
    lfgChannelId: configRow?.lfg_channel_id ?? null,
    enabledVoiceChannelIds: watchlistRows.map((row) => row.voice_channel_id),
    joinToCreateLobbyIds: lobbyRows.map((row) => row.lobby_channel_id),
  };
}

export function saveGuildConfig(guildId: string, config: GuildConfig) {
  const database = getDb();
  const now = new Date().toISOString();

  const upsertConfig = database.prepare(
    `
      INSERT INTO guild_config (guild_id, log_channel_id, lfg_channel_id, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        log_channel_id = excluded.log_channel_id,
        lfg_channel_id = excluded.lfg_channel_id,
        updated_at = excluded.updated_at
    `
  );

  const clearWatchlist = database.prepare(
    "DELETE FROM voice_watchlist WHERE guild_id = ?"
  );
  const insertWatchlist = database.prepare(
    "INSERT INTO voice_watchlist (guild_id, voice_channel_id, enabled) VALUES (?, ?, 1)"
  );

  const clearLobbies = database.prepare(
    "DELETE FROM join_to_create_lobbies WHERE guild_id = ?"
  );
  const insertLobby = database.prepare(
    "INSERT INTO join_to_create_lobbies (guild_id, lobby_channel_id) VALUES (?, ?)"
  );

  const transaction = database.transaction(() => {
    if (!config.logChannelId) {
      throw new Error("logChannelId is required");
    }
    upsertConfig.run(guildId, config.logChannelId, config.lfgChannelId, now);
    clearWatchlist.run(guildId);
    for (const channelId of config.enabledVoiceChannelIds) {
      insertWatchlist.run(guildId, channelId);
    }
    clearLobbies.run(guildId);
    for (const lobbyId of config.joinToCreateLobbyIds) {
      insertLobby.run(guildId, lobbyId);
    }
  });

  transaction();
}

export function getTempChannels(guildId: string) {
  const database = getDb();
  return database
    .prepare(
      `
        SELECT channel_id, owner_id, created_at, lfg_channel_id, lfg_message_id
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
  }[];
}

export function setProcessMetrics(
  service: string,
  metrics: {
    pid: number;
    cpuPercent: number;
    memoryRss: number;
    memoryHeapUsed: number;
    memoryHeapTotal: number;
    uptimeSeconds: number;
  }
) {
  const database = getDb();
  const now = new Date().toISOString();
  database
    .prepare(
      `
        INSERT INTO process_metrics (
          service,
          pid,
          cpu_percent,
          memory_rss,
          memory_heap_used,
          memory_heap_total,
          uptime_seconds,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(service) DO UPDATE SET
          pid = excluded.pid,
          cpu_percent = excluded.cpu_percent,
          memory_rss = excluded.memory_rss,
          memory_heap_used = excluded.memory_heap_used,
          memory_heap_total = excluded.memory_heap_total,
          uptime_seconds = excluded.uptime_seconds,
          updated_at = excluded.updated_at
      `
    )
    .run(
      service,
      metrics.pid,
      metrics.cpuPercent,
      metrics.memoryRss,
      metrics.memoryHeapUsed,
      metrics.memoryHeapTotal,
      metrics.uptimeSeconds,
      now
    );
}

export function getProcessMetrics() {
  const database = getDb();
  return database
    .prepare(
      `
        SELECT service, pid, cpu_percent, memory_rss, memory_heap_used,
               memory_heap_total, uptime_seconds, updated_at
        FROM process_metrics
      `
    )
    .all() as {
    service: string;
    pid: number;
    cpu_percent: number;
    memory_rss: number;
    memory_heap_used: number;
    memory_heap_total: number;
    uptime_seconds: number;
    updated_at: string;
  }[];
}
