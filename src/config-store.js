const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL in environment.');
}

const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  : null;

async function getPool() {
  if (!pool) {
    throw new Error('DATABASE_URL is required.');
  }
  return pool;
}

async function query(text, params) {
  const db = await getPool();
  return db.query(text, params);
}

let lfgEnabledColumnEnsured = false;
let tempVoiceLfgEnabledColumnEnsured = false;
let tempVoiceActivityEnsured = false;
let tempVoiceDeleteLogsEnsured = false;

async function ensureJoinToCreateLfgEnabledColumn() {
  if (lfgEnabledColumnEnsured) return;
  try {
    await query(
      'ALTER TABLE IF EXISTS join_to_create_lobbies ADD COLUMN IF NOT EXISTS lfg_enabled BOOLEAN NOT NULL DEFAULT TRUE'
    );
    lfgEnabledColumnEnsured = true;
  } catch (error) {
    console.error('Failed to ensure join_to_create_lobbies.lfg_enabled column:', error);
  }
}

async function ensureTempVoiceLfgEnabledColumn() {
  if (tempVoiceLfgEnabledColumnEnsured) return;
  try {
    await query(
      'ALTER TABLE IF EXISTS temp_voice_channels ADD COLUMN IF NOT EXISTS lfg_enabled BOOLEAN NOT NULL DEFAULT TRUE'
    );
    tempVoiceLfgEnabledColumnEnsured = true;
  } catch (error) {
    console.error('Failed to ensure temp_voice_channels.lfg_enabled column:', error);
  }
}

async function ensureTempVoiceActivityTable() {
  if (tempVoiceActivityEnsured) return;
  try {
    await query(
      `
        CREATE TABLE IF NOT EXISTS temp_voice_activity (
          channel_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          joined_at TIMESTAMPTZ,
          total_ms BIGINT NOT NULL DEFAULT 0,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (channel_id, user_id)
        )
      `
    );
    tempVoiceActivityEnsured = true;
  } catch (error) {
    console.error('Failed to ensure temp_voice_activity table:', error);
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
    console.error('Failed to ensure temp_voice_delete_logs table:', error);
  }
}

async function getGuildConfig(guildId) {
  await ensureJoinToCreateLfgEnabledColumn();
  const configRes = await query(
    'SELECT log_channel_id, lfg_channel_id FROM guild_config WHERE guild_id = $1',
    [guildId]
  );
  const configRow = configRes.rows[0] ?? {};

  const watchlistRes = await query(
    'SELECT voice_channel_id FROM voice_watchlist WHERE guild_id = $1 AND enabled = true',
    [guildId]
  );
  let lobbyRes;
  try {
    lobbyRes = await query(
      'SELECT lobby_channel_id, role_id, lfg_enabled FROM join_to_create_lobbies WHERE guild_id = $1',
      [guildId]
    );
  } catch (error) {
    if (error?.code !== '42703') throw error;
    lobbyRes = await query(
      'SELECT lobby_channel_id, role_id FROM join_to_create_lobbies WHERE guild_id = $1',
      [guildId]
    );
  }
  const joinToCreateLobbies = lobbyRes.rows.map((row) => ({
    channelId: row.lobby_channel_id,
    roleId: row.role_id ?? null,
    lfgEnabled: row.lfg_enabled ?? true,
  }));
  const joinToCreateLobbyIds = joinToCreateLobbies
    .filter((row) => row.roleId)
    .map((row) => row.channelId);
  const lfgEnabledLobbyIds = joinToCreateLobbies
    .filter((row) => row.roleId && row.lfgEnabled)
    .map((row) => row.channelId);

  return {
    logChannelId: configRow.log_channel_id ?? null,
    lfgChannelId: configRow.lfg_channel_id ?? null,
    enabledVoiceChannelIds: watchlistRes.rows.map(
      (row) => row.voice_channel_id
    ),
    lfgEnabledLobbyIds,
    joinToCreateLobbyIds,
    joinToCreateLobbies,
  };
}

async function getPersistentLfgMessage(guildId) {
  const res = await query(
    'SELECT channel_id, message_id FROM lfg_persistent_message WHERE guild_id = $1',
    [guildId]
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    channelId: row.channel_id,
    messageId: row.message_id,
  };
}

async function setPersistentLfgMessage(guildId, channelId, messageId) {
  await query(
    `
      INSERT INTO lfg_persistent_message (guild_id, channel_id, message_id, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT(guild_id) DO UPDATE SET
        channel_id = EXCLUDED.channel_id,
        message_id = EXCLUDED.message_id,
        updated_at = EXCLUDED.updated_at
    `,
    [guildId, channelId, messageId]
  );
}

async function clearPersistentLfgMessage(guildId) {
  await query('DELETE FROM lfg_persistent_message WHERE guild_id = $1', [
    guildId,
  ]);
}


async function addTempChannel(
  guildId,
  channelId,
  ownerId,
  roleId = null,
  lfgEnabled = true
) {
  await ensureTempVoiceLfgEnabledColumn();
  await query(
    `
      INSERT INTO temp_voice_channels (
        guild_id,
        channel_id,
        owner_id,
        created_at,
        role_id,
        lfg_enabled
      )
      VALUES ($1, $2, $3, NOW(), $4, $5)
      ON CONFLICT(channel_id) DO UPDATE SET
        guild_id = EXCLUDED.guild_id,
        owner_id = EXCLUDED.owner_id,
        created_at = EXCLUDED.created_at,
        role_id = EXCLUDED.role_id,
        lfg_enabled = EXCLUDED.lfg_enabled
    `,
    [guildId, channelId, ownerId, roleId, lfgEnabled]
  );
}

async function getTempChannelsForGuild(guildId) {
  const res = await query(
    'SELECT channel_id, owner_id, created_at FROM temp_voice_channels WHERE guild_id = $1 ORDER BY created_at DESC',
    [guildId]
  );
  return res.rows;
}

async function getTempChannelByOwner(guildId, ownerId) {
  const res = await query(
    'SELECT channel_id FROM temp_voice_channels WHERE guild_id = $1 AND owner_id = $2 ORDER BY created_at DESC LIMIT 1',
    [guildId, ownerId]
  );
  return res.rows[0]?.channel_id ?? null;
}

async function getTempChannelOwner(channelId) {
  const res = await query(
    'SELECT owner_id FROM temp_voice_channels WHERE channel_id = $1',
    [channelId]
  );
  return res.rows[0]?.owner_id ?? null;
}

async function getTempChannelInfo(channelId) {
  await ensureTempVoiceLfgEnabledColumn();
  let res;
  try {
    res = await query(
      'SELECT owner_id, lfg_channel_id, lfg_message_id, role_id, lfg_enabled FROM temp_voice_channels WHERE channel_id = $1',
      [channelId]
    );
  } catch (error) {
    if (error?.code !== '42703') throw error;
    res = await query(
      'SELECT owner_id, lfg_channel_id, lfg_message_id, role_id FROM temp_voice_channels WHERE channel_id = $1',
      [channelId]
    );
  }
  const row = res.rows[0];
  if (!row) return null;
  return {
    ownerId: row.owner_id,
    lfgChannelId: row.lfg_channel_id ?? null,
    lfgMessageId: row.lfg_message_id ?? null,
    roleId: row.role_id ?? null,
    lfgEnabled: row.lfg_enabled ?? true,
  };
}

async function updateTempChannelMessage(channelId, lfgChannelId, lfgMessageId) {
  await query(
    'UPDATE temp_voice_channels SET lfg_channel_id = $1, lfg_message_id = $2 WHERE channel_id = $3',
    [lfgChannelId, lfgMessageId, channelId]
  );
}

async function updateTempChannelOwner(channelId, ownerId) {
  await query(
    'UPDATE temp_voice_channels SET owner_id = $1 WHERE channel_id = $2',
    [ownerId, channelId]
  );
}

async function removeTempChannel(channelId) {
  await clearVoiceActivity(channelId).catch(() => null);
  await query('DELETE FROM temp_voice_channels WHERE channel_id = $1', [
    channelId,
  ]);
}

async function upsertVoiceJoin(channelId, userId, joinedAt = new Date()) {
  await ensureTempVoiceActivityTable();
  await query(
    `
      INSERT INTO temp_voice_activity (channel_id, user_id, is_active, joined_at, total_ms, updated_at)
      VALUES ($1, $2, TRUE, $3, 0, NOW())
      ON CONFLICT(channel_id, user_id) DO UPDATE SET
        is_active = TRUE,
        joined_at = CASE
          WHEN temp_voice_activity.is_active = TRUE AND temp_voice_activity.joined_at IS NOT NULL
            THEN temp_voice_activity.joined_at
          ELSE EXCLUDED.joined_at
        END,
        updated_at = NOW()
    `,
    [channelId, userId, joinedAt]
  );
}

async function markVoiceLeave(channelId, userId, leftAt = new Date()) {
  await ensureTempVoiceActivityTable();
  await query(
    `
      UPDATE temp_voice_activity
      SET
        total_ms = total_ms + CASE
          WHEN is_active = TRUE AND joined_at IS NOT NULL
            THEN GREATEST(
              0,
              FLOOR(EXTRACT(EPOCH FROM ($3::timestamptz - joined_at)) * 1000)
            )::BIGINT
          ELSE 0
        END,
        is_active = FALSE,
        joined_at = NULL,
        updated_at = NOW()
      WHERE channel_id = $1 AND user_id = $2
    `,
    [channelId, userId, leftAt]
  );
}

async function finalizeVoiceActivity(channelId, at = new Date()) {
  await ensureTempVoiceActivityTable();
  await query(
    `
      UPDATE temp_voice_activity
      SET
        total_ms = total_ms + CASE
          WHEN is_active = TRUE AND joined_at IS NOT NULL
            THEN GREATEST(
              0,
              FLOOR(EXTRACT(EPOCH FROM ($2::timestamptz - joined_at)) * 1000)
            )::BIGINT
          ELSE 0
        END,
        is_active = FALSE,
        joined_at = NULL,
        updated_at = NOW()
      WHERE channel_id = $1
        AND is_active = TRUE
    `,
    [channelId, at]
  );
}

async function getVoiceActivity(channelId) {
  await ensureTempVoiceActivityTable();
  const res = await query(
    `
      SELECT
        user_id,
        is_active,
        joined_at,
        total_ms,
        updated_at
      FROM temp_voice_activity
      WHERE channel_id = $1
      ORDER BY is_active DESC, updated_at DESC
    `,
    [channelId]
  );

  return res.rows.map((row) => ({
    userId: row.user_id,
    isActive: row.is_active === true,
    joinedAt: row.joined_at ? new Date(row.joined_at) : null,
    totalMs: Number(row.total_ms) || 0,
    updatedAt: row.updated_at ? new Date(row.updated_at) : null,
  }));
}

async function clearVoiceActivity(channelId) {
  await ensureTempVoiceActivityTable();
  await query('DELETE FROM temp_voice_activity WHERE channel_id = $1', [channelId]);
}

async function addTempVoiceDeleteLog({
  guildId,
  channelId,
  channelName = null,
  ownerId,
  history = [],
  deletedAt = new Date(),
}) {
  await ensureTempVoiceDeleteLogsTable();
  await query(
    `
      INSERT INTO temp_voice_delete_logs (
        guild_id,
        channel_id,
        channel_name,
        owner_id,
        deleted_at,
        history_json
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [
      guildId,
      channelId,
      channelName,
      ownerId,
      deletedAt,
      JSON.stringify(history),
    ]
  );
}

async function getVoiceStatsForUser(guildId, userId) {
  await ensureTempVoiceActivityTable();
  await ensureTempVoiceDeleteLogsTable();

  const aggregateRes = await query(
    `
      WITH expanded AS (
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
      )
      SELECT
        COALESCE(SUM(total_ms), 0)::bigint AS total_ms,
        COUNT(*)::bigint AS sessions,
        COALESCE(MAX(total_ms), 0)::bigint AS longest_ms
      FROM expanded
      WHERE user_id = $2
    `,
    [guildId, userId]
  );

  const rankRes = await query(
    `
      WITH expanded AS (
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
      leaderboard AS (
        SELECT
          user_id,
          SUM(total_ms)::bigint AS total_ms,
          COUNT(*)::bigint AS sessions
        FROM expanded
        GROUP BY user_id
      ),
      ranked AS (
        SELECT
          user_id,
          ROW_NUMBER() OVER (
            ORDER BY total_ms DESC, sessions DESC, user_id ASC
          ) AS rank_position
        FROM leaderboard
      )
      SELECT rank_position
      FROM ranked
      WHERE user_id = $2
    `,
    [guildId, userId]
  );

  const ownerRes = await query(
    `
      SELECT COUNT(*)::bigint AS owner_count
      FROM temp_voice_delete_logs
      WHERE guild_id = $1
        AND owner_id = $2
    `,
    [guildId, userId]
  );

  const activeRes = await query(
    `
      SELECT
        a.channel_id,
        a.joined_at,
        a.total_ms
      FROM temp_voice_activity a
      INNER JOIN temp_voice_channels t ON t.channel_id = a.channel_id
      WHERE t.guild_id = $1
        AND a.user_id = $2
        AND a.is_active = TRUE
      ORDER BY a.joined_at DESC NULLS LAST
      LIMIT 1
    `,
    [guildId, userId]
  );

  const aggregate = aggregateRes.rows[0] || {};
  const active = activeRes.rows[0] || null;

  return {
    totalMs: Number(aggregate.total_ms || 0),
    sessions: Number(aggregate.sessions || 0),
    longestMs: Number(aggregate.longest_ms || 0),
    ownerCount: Number(ownerRes.rows[0]?.owner_count || 0),
    rank: Number(rankRes.rows[0]?.rank_position || 0) || null,
    activeNow: active
      ? {
          channelId: active.channel_id,
          joinedAt: active.joined_at ? new Date(active.joined_at) : null,
          previousTotalMs: Number(active.total_ms || 0),
        }
      : null,
  };
}

async function getVoiceLeaderboard(guildId, limit = 10) {
  await ensureTempVoiceDeleteLogsTable();
  const safeLimit = Number.isFinite(limit)
    ? Math.min(50, Math.max(1, Math.floor(limit)))
    : 10;

  const res = await query(
    `
      WITH expanded AS (
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
      )
      SELECT
        user_id,
        SUM(total_ms)::bigint AS total_ms,
        COUNT(*)::bigint AS sessions
      FROM expanded
      GROUP BY user_id
      ORDER BY total_ms DESC, sessions DESC, user_id ASC
      LIMIT $2
    `,
    [guildId, safeLimit]
  );

  return res.rows.map((row, index) => ({
    rank: index + 1,
    userId: row.user_id,
    totalMs: Number(row.total_ms || 0),
    sessions: Number(row.sessions || 0),
  }));
}

module.exports = {
  getGuildConfig,
  addTempChannel,
  clearPersistentLfgMessage,
  getPersistentLfgMessage,
  getTempChannelsForGuild,
  getTempChannelByOwner,
  getTempChannelOwner,
  getTempChannelInfo,
  getVoiceActivity,
  finalizeVoiceActivity,
  markVoiceLeave,
  removeTempChannel,
  setPersistentLfgMessage,
  upsertVoiceJoin,
  updateTempChannelMessage,
  updateTempChannelOwner,
  clearVoiceActivity,
  addTempVoiceDeleteLog,
  getVoiceLeaderboard,
  getVoiceStatsForUser,
};
