const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_DB_PATH = path.resolve(REPO_ROOT, "data", "discord.db");
const DATABASE_PATH = process.env.DATABASE_PATH
  ? path.resolve(REPO_ROOT, process.env.DATABASE_PATH)
  : DEFAULT_DB_PATH;
const cacheTtlRaw = Number(process.env.CONFIG_CACHE_TTL_MS);
const CACHE_TTL_MS = Number.isFinite(cacheTtlRaw) ? cacheTtlRaw : 60000;

let db = null;
const cache = new Map();

function initDb() {
  fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });
  const instance = new Database(DATABASE_PATH);
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

  const columns = instance
    .prepare("PRAGMA table_info(temp_voice_channels)")
    .all()
    .map((column) => column.name);
  if (!columns.includes("lfg_channel_id")) {
    instance.exec("ALTER TABLE temp_voice_channels ADD COLUMN lfg_channel_id TEXT");
  }
  if (!columns.includes("lfg_message_id")) {
    instance.exec("ALTER TABLE temp_voice_channels ADD COLUMN lfg_message_id TEXT");
  }

  const configColumns = instance
    .prepare("PRAGMA table_info(guild_config)")
    .all()
    .map((column) => column.name);
  if (!configColumns.includes("lfg_channel_id")) {
    instance.exec("ALTER TABLE guild_config ADD COLUMN lfg_channel_id TEXT");
  }
  return instance;
}

function getDb() {
  if (!db) db = initDb();
  return db;
}

function fetchGuildConfig(guildId) {
  const database = getDb();
  const configRow = database
    .prepare(
      "SELECT log_channel_id, lfg_channel_id FROM guild_config WHERE guild_id = ?"
    )
    .get(guildId);
  const watchlistRows = database
    .prepare(
      "SELECT voice_channel_id FROM voice_watchlist WHERE guild_id = ? AND enabled = 1"
    )
    .all(guildId);
  const lobbyRows = database
    .prepare(
      "SELECT lobby_channel_id FROM join_to_create_lobbies WHERE guild_id = ?"
    )
    .all(guildId);

  return {
    logChannelId: configRow?.log_channel_id ?? null,
    lfgChannelId: configRow?.lfg_channel_id ?? null,
    enabledVoiceChannelIds: watchlistRows.map((row) => row.voice_channel_id),
    joinToCreateLobbyIds: lobbyRows.map((row) => row.lobby_channel_id),
  };
}

function getGuildConfig(guildId) {
  const cached = cache.get(guildId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.value;
  }

  const value = fetchGuildConfig(guildId);
  cache.set(guildId, { value, timestamp: Date.now() });
  return value;
}

function getPersistentLfgMessage(guildId) {
  const database = getDb();
  const row = database
    .prepare(
      "SELECT channel_id, message_id FROM lfg_persistent_message WHERE guild_id = ?"
    )
    .get(guildId);
  if (!row) return null;
  return {
    channelId: row.channel_id,
    messageId: row.message_id,
  };
}

function setPersistentLfgMessage(guildId, channelId, messageId) {
  const database = getDb();
  const now = new Date().toISOString();
  database
    .prepare(
      `
        INSERT INTO lfg_persistent_message (guild_id, channel_id, message_id, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(guild_id) DO UPDATE SET
          channel_id = excluded.channel_id,
          message_id = excluded.message_id,
          updated_at = excluded.updated_at
      `
    )
    .run(guildId, channelId, messageId, now);
}

function clearPersistentLfgMessage(guildId) {
  const database = getDb();
  database
    .prepare("DELETE FROM lfg_persistent_message WHERE guild_id = ?")
    .run(guildId);
}

function setProcessMetrics(service, metrics) {
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

function getProcessMetrics() {
  const database = getDb();
  return database
    .prepare(
      `
        SELECT service, pid, cpu_percent, memory_rss, memory_heap_used,
               memory_heap_total, uptime_seconds, updated_at
        FROM process_metrics
      `
    )
    .all();
}

function addTempChannel(guildId, channelId, ownerId) {
  const database = getDb();
  const now = new Date().toISOString();
  database
    .prepare(
      "INSERT OR REPLACE INTO temp_voice_channels (guild_id, channel_id, owner_id, created_at) VALUES (?, ?, ?, ?)"
    )
    .run(guildId, channelId, ownerId, now);
}

function getTempChannelsForGuild(guildId) {
  const database = getDb();
  return database
    .prepare(
      "SELECT channel_id, owner_id, created_at FROM temp_voice_channels WHERE guild_id = ? ORDER BY created_at DESC"
    )
    .all(guildId);
}

function getTempChannelByOwner(guildId, ownerId) {
  const database = getDb();
  const row = database
    .prepare(
      "SELECT channel_id FROM temp_voice_channels WHERE guild_id = ? AND owner_id = ? ORDER BY created_at DESC LIMIT 1"
    )
    .get(guildId, ownerId);
  return row?.channel_id ?? null;
}

function getTempChannelOwner(channelId) {
  const database = getDb();
  const row = database
    .prepare("SELECT owner_id FROM temp_voice_channels WHERE channel_id = ?")
    .get(channelId);
  return row?.owner_id ?? null;
}

function getTempChannelInfo(channelId) {
  const database = getDb();
  const row = database
    .prepare(
      "SELECT owner_id, lfg_channel_id, lfg_message_id FROM temp_voice_channels WHERE channel_id = ?"
    )
    .get(channelId);
  if (!row) return null;
  return {
    ownerId: row.owner_id,
    lfgChannelId: row.lfg_channel_id ?? null,
    lfgMessageId: row.lfg_message_id ?? null,
  };
}

function updateTempChannelMessage(channelId, lfgChannelId, lfgMessageId) {
  const database = getDb();
  database
    .prepare(
      "UPDATE temp_voice_channels SET lfg_channel_id = ?, lfg_message_id = ? WHERE channel_id = ?"
    )
    .run(lfgChannelId, lfgMessageId, channelId);
}

function removeTempChannel(channelId) {
  const database = getDb();
  database
    .prepare("DELETE FROM temp_voice_channels WHERE channel_id = ?")
    .run(channelId);
}

module.exports = {
  getGuildConfig,
  addTempChannel,
  clearPersistentLfgMessage,
  getPersistentLfgMessage,
  getProcessMetrics,
  getTempChannelsForGuild,
  getTempChannelByOwner,
  getTempChannelOwner,
  getTempChannelInfo,
  removeTempChannel,
  setProcessMetrics,
  setPersistentLfgMessage,
  updateTempChannelMessage,
};
