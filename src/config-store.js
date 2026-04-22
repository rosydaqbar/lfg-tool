const { Pool } = require('pg');
const { buildPgSslConfig } = require('./lib/pg-ssl');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL in environment.');
}

const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: buildPgSslConfig(),
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
let tempVoicePromptMessageColumnEnsured = false;
let tempVoiceOwnerLookupIndexEnsured = false;
let tempVoiceActivityEnsured = false;
let tempVoiceDeleteLogsEnsured = false;
let manualVoiceActivityEnsured = false;
let manualVoiceSessionLogsEnsured = false;
let manualVoicePanelMessageEnsured = false;
let persistentLfgMessageEnsured = false;
let voiceAutoRoleConfigEnsured = false;
let voiceAutoRoleRequestsEnsured = false;
let voiceLeaderboardOverridesEnsured = false;

const TEMP_OWNER_CACHE_TTL_MS = 15_000;
const tempOwnerByOwnerKeyCache = new Map();
const tempOwnerByChannelIdCache = new Map();

function ownerCacheKey(guildId, ownerId) {
  return `${guildId}:${ownerId}`;
}

function setTempOwnerCache(guildId, ownerId, channelId) {
  if (!guildId || !ownerId || !channelId) return;
  const key = ownerCacheKey(guildId, ownerId);
  tempOwnerByOwnerKeyCache.set(key, {
    channelId,
    expiresAt: Date.now() + TEMP_OWNER_CACHE_TTL_MS,
  });
  tempOwnerByChannelIdCache.set(channelId, { guildId, ownerId });
}

function clearTempOwnerCacheByOwner(guildId, ownerId) {
  if (!guildId || !ownerId) return;
  const key = ownerCacheKey(guildId, ownerId);
  const current = tempOwnerByOwnerKeyCache.get(key);
  if (current?.channelId) {
    const reverse = tempOwnerByChannelIdCache.get(current.channelId);
    if (reverse?.guildId === guildId && reverse?.ownerId === ownerId) {
      tempOwnerByChannelIdCache.delete(current.channelId);
    }
  }
  tempOwnerByOwnerKeyCache.delete(key);
}

function clearTempOwnerCacheByChannel(channelId) {
  if (!channelId) return;
  const reverse = tempOwnerByChannelIdCache.get(channelId);
  if (reverse?.guildId && reverse?.ownerId) {
    const key = ownerCacheKey(reverse.guildId, reverse.ownerId);
    const current = tempOwnerByOwnerKeyCache.get(key);
    if (current?.channelId === channelId) {
      tempOwnerByOwnerKeyCache.delete(key);
    }
  }
  tempOwnerByChannelIdCache.delete(channelId);
}

function getCachedTempChannelByOwner(guildId, ownerId) {
  if (!guildId || !ownerId) return null;
  const key = ownerCacheKey(guildId, ownerId);
  const cached = tempOwnerByOwnerKeyCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    tempOwnerByOwnerKeyCache.delete(key);
    if (cached.channelId) {
      const reverse = tempOwnerByChannelIdCache.get(cached.channelId);
      if (reverse?.guildId === guildId && reverse?.ownerId === ownerId) {
        tempOwnerByChannelIdCache.delete(cached.channelId);
      }
    }
    return null;
  }
  return cached.channelId;
}

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

async function ensureTempVoicePromptMessageColumn() {
  if (tempVoicePromptMessageColumnEnsured) return;
  try {
    await query(
      'ALTER TABLE IF EXISTS temp_voice_channels ADD COLUMN IF NOT EXISTS prompt_message_id TEXT'
    );
    tempVoicePromptMessageColumnEnsured = true;
  } catch (error) {
    console.error('Failed to ensure temp_voice_channels.prompt_message_id column:', error);
  }
}

async function ensureTempVoiceOwnerLookupIndex() {
  if (tempVoiceOwnerLookupIndexEnsured) return;
  try {
    await query(
      'CREATE INDEX IF NOT EXISTS idx_temp_voice_guild_owner_created ON temp_voice_channels(guild_id, owner_id, created_at DESC)'
    );
    tempVoiceOwnerLookupIndexEnsured = true;
  } catch (error) {
    console.error('Failed to ensure temp_voice_channels owner lookup index:', error);
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

async function ensureManualVoiceActivityTable() {
  if (manualVoiceActivityEnsured) return;
  try {
    await query(
      `
        CREATE TABLE IF NOT EXISTS manual_voice_activity (
          guild_id TEXT NOT NULL,
          channel_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          joined_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (guild_id, channel_id, user_id)
        )
      `
    );
    manualVoiceActivityEnsured = true;
  } catch (error) {
    console.error('Failed to ensure manual_voice_activity table:', error);
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
    console.error('Failed to ensure manual_voice_session_logs table:', error);
  }
}

async function ensureManualVoicePanelMessageTable() {
  if (manualVoicePanelMessageEnsured) return;
  try {
    await query(
      `
        CREATE TABLE IF NOT EXISTS manual_voice_panel_message (
          guild_id TEXT NOT NULL,
          channel_id TEXT NOT NULL,
          message_id TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (guild_id, channel_id)
        )
      `
    );
    manualVoicePanelMessageEnsured = true;
  } catch (error) {
    console.error('Failed to ensure manual_voice_panel_message table:', error);
  }
}

async function ensurePersistentLfgMessageTable() {
  if (persistentLfgMessageEnsured) return;
  try {
    await query(
      `
        CREATE TABLE IF NOT EXISTS lfg_persistent_message (
          guild_id TEXT PRIMARY KEY,
          channel_id TEXT NOT NULL,
          message_id TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
    );
    persistentLfgMessageEnsured = true;
  } catch (error) {
    console.error('Failed to ensure lfg_persistent_message table:', error);
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

async function getVoiceAutoRoleConfig(guildId) {
  await ensureVoiceAutoRoleConfigTable();
  const res = await query(
    'SELECT config_json FROM voice_auto_role_config WHERE guild_id = $1',
    [guildId]
  );
  const row = res.rows[0];
  return normalizeAutoRoleConfig(row?.config_json || null);
}

async function getGuildVoiceTotals(guildId) {
  await ensureTempVoiceDeleteLogsTable();
  await ensureManualVoiceSessionLogsTable();
  await ensureTempVoiceActivityTable();
  await ensureManualVoiceActivityTable();
  await ensureVoiceLeaderboardOverridesTable();

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
      manual_history AS (
        SELECT user_id, total_ms
        FROM manual_voice_session_logs
        WHERE guild_id = $1
      ),
      temp_active AS (
        SELECT
          a.user_id,
          GREATEST(
            0,
            a.total_ms + CASE
              WHEN a.joined_at IS NULL THEN 0
              ELSE FLOOR(EXTRACT(EPOCH FROM (NOW() - a.joined_at)) * 1000)
            END
          )::bigint AS total_ms
        FROM temp_voice_activity a
        INNER JOIN temp_voice_channels t ON t.channel_id = a.channel_id
        WHERE t.guild_id = $1
          AND a.is_active = TRUE
      ),
      manual_active AS (
        SELECT
          user_id,
          GREATEST(
            0,
            FLOOR(EXTRACT(EPOCH FROM (NOW() - joined_at)) * 1000)
          )::bigint AS total_ms
        FROM manual_voice_activity
        WHERE guild_id = $1
      ),
      all_rows AS (
        SELECT user_id, total_ms FROM temp_expanded
        UNION ALL
        SELECT user_id, total_ms FROM manual_history
        UNION ALL
        SELECT user_id, total_ms FROM temp_active
        UNION ALL
        SELECT user_id, total_ms FROM manual_active
      )
      SELECT
        user_id,
        SUM(total_ms)::bigint AS total_ms
      FROM all_rows
      GROUP BY user_id
      HAVING SUM(total_ms) > 0
      ORDER BY SUM(total_ms) DESC, user_id ASC
    `,
    [guildId]
  );

  const baseTotals = new Map(
    res.rows.map((row) => [row.user_id, Number(row.total_ms || 0)])
  );

  const overrideRes = await query(
    `
      SELECT user_id, total_ms, is_deleted
      FROM voice_leaderboard_overrides
      WHERE guild_id = $1
    `,
    [guildId]
  );

  for (const row of overrideRes.rows) {
    const isDeleted = row.is_deleted === true || Number(row.is_deleted || 0) !== 0;
    if (isDeleted) {
      baseTotals.delete(row.user_id);
      continue;
    }
    baseTotals.set(row.user_id, Math.max(0, Number(row.total_ms || 0)));
  }

  return [...baseTotals.entries()]
    .map(([userId, totalMs]) => ({ userId, totalMs }))
    .filter((row) => row.totalMs > 0)
    .sort((a, b) => {
      if (b.totalMs !== a.totalMs) return b.totalMs - a.totalMs;
      return a.userId.localeCompare(b.userId);
    });
}

function mapVoiceAutoRoleRequestRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    guildId: row.guild_id,
    userId: row.user_id,
    roleId: row.role_id,
    ruleKey: row.rule_key,
    status: row.status,
    totalMs: Number(row.total_ms || 0),
    messageChannelId: row.message_channel_id || null,
    messageId: row.message_id || null,
    decidedBy: row.decided_by || null,
    decidedAt: row.decided_at ? new Date(row.decided_at) : null,
    createdAt: row.created_at ? new Date(row.created_at) : null,
    updatedAt: row.updated_at ? new Date(row.updated_at) : null,
  };
}

async function getVoiceAutoRoleRequest(guildId, userId, roleId, ruleKey) {
  await ensureVoiceAutoRoleRequestsTable();
  const res = await query(
    `
      SELECT
        id,
        guild_id,
        user_id,
        role_id,
        rule_key,
        status,
        total_ms,
        message_channel_id,
        message_id,
        decided_by,
        decided_at,
        created_at,
        updated_at
      FROM voice_auto_role_requests
      WHERE guild_id = $1
        AND user_id = $2
        AND role_id = $3
        AND rule_key = $4
      LIMIT 1
    `,
    [guildId, userId, roleId, ruleKey]
  );
  return mapVoiceAutoRoleRequestRow(res.rows[0]);
}

async function getVoiceAutoRoleRequestById(id) {
  await ensureVoiceAutoRoleRequestsTable();
  const res = await query(
    `
      SELECT
        id,
        guild_id,
        user_id,
        role_id,
        rule_key,
        status,
        total_ms,
        message_channel_id,
        message_id,
        decided_by,
        decided_at,
        created_at,
        updated_at
      FROM voice_auto_role_requests
      WHERE id = $1
      LIMIT 1
    `,
    [id]
  );
  return mapVoiceAutoRoleRequestRow(res.rows[0]);
}

async function createOrGetVoiceAutoRoleRequest({
  guildId,
  userId,
  roleId,
  ruleKey,
  totalMs = 0,
}) {
  await ensureVoiceAutoRoleRequestsTable();
  await query(
    `
      INSERT INTO voice_auto_role_requests (
        guild_id,
        user_id,
        role_id,
        rule_key,
        status,
        total_ms,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, 'pending', $5, NOW(), NOW())
      ON CONFLICT (guild_id, user_id, role_id, rule_key)
      DO NOTHING
    `,
    [guildId, userId, roleId, ruleKey, Math.max(0, Number(totalMs) || 0)]
  );
  return getVoiceAutoRoleRequest(guildId, userId, roleId, ruleKey);
}

async function updateVoiceAutoRoleRequestMessage(id, messageChannelId, messageId) {
  await ensureVoiceAutoRoleRequestsTable();
  await query(
    `
      UPDATE voice_auto_role_requests
      SET message_channel_id = $1,
          message_id = $2,
          updated_at = NOW()
      WHERE id = $3
    `,
    [messageChannelId, messageId, id]
  );
}

async function updateVoiceAutoRoleRequestStatus(id, status, decidedBy = null) {
  await ensureVoiceAutoRoleRequestsTable();
  await query(
    `
      UPDATE voice_auto_role_requests
      SET status = $1,
          decided_by = $2,
          decided_at = NOW(),
          updated_at = NOW()
      WHERE id = $3
    `,
    [status, decidedBy, id]
  );
}

async function getPersistentLfgMessage(guildId) {
  await ensurePersistentLfgMessageTable();
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
  await ensurePersistentLfgMessageTable();
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
  await ensurePersistentLfgMessageTable();
  await query('DELETE FROM lfg_persistent_message WHERE guild_id = $1', [
    guildId,
  ]);
}

async function getManualVoicePanelMessage(guildId, channelId) {
  await ensureManualVoicePanelMessageTable();
  const res = await query(
    `
      SELECT message_id
      FROM manual_voice_panel_message
      WHERE guild_id = $1
        AND channel_id = $2
    `,
    [guildId, channelId]
  );
  const row = res.rows[0];
  return row?.message_id || null;
}

async function setManualVoicePanelMessage(guildId, channelId, messageId) {
  await ensureManualVoicePanelMessageTable();
  await query(
    `
      INSERT INTO manual_voice_panel_message (guild_id, channel_id, message_id, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT(guild_id, channel_id) DO UPDATE SET
        message_id = EXCLUDED.message_id,
        updated_at = EXCLUDED.updated_at
    `,
    [guildId, channelId, messageId]
  );
}

async function clearManualVoicePanelMessage(guildId, channelId) {
  await ensureManualVoicePanelMessageTable();
  await query(
    `
      DELETE FROM manual_voice_panel_message
      WHERE guild_id = $1
        AND channel_id = $2
    `,
    [guildId, channelId]
  );
}


async function addTempChannel(
  guildId,
  channelId,
  ownerId,
  roleId = null,
  lfgEnabled = true
) {
  await ensureTempVoiceLfgEnabledColumn();
  await ensureTempVoicePromptMessageColumn();
  await ensureTempVoiceOwnerLookupIndex();
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
  setTempOwnerCache(guildId, ownerId, channelId);
}

const DEFAULT_AUTO_ROLE_CONFIG = {
  enabled: false,
  requiredRoleMode: 'all_roles',
  requiredRoleIds: [],
  rules: [],
  requireAdminApproval: false,
  approvalChannelId: null,
};

function normalizeAutoRoleConfig(value) {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_AUTO_ROLE_CONFIG };
  }

  const rules = Array.isArray(value.rules)
    ? value.rules
      .filter((rule) => rule && typeof rule === 'object')
      .map((rule, index) => {
        const rawHours = Number(rule.hours);
        return {
          id:
            typeof rule.id === 'string' && rule.id.trim().length > 0
              ? rule.id.trim()
              : `rule_${index + 1}`,
          condition:
            rule.condition === 'more_than'
            || rule.condition === 'less_than'
            || rule.condition === 'equal_to'
              ? rule.condition
              : 'more_than',
          hours: Number.isFinite(rawHours)
            ? Math.max(0, Math.floor(rawHours))
            : 0,
          roleId: typeof rule.roleId === 'string' ? rule.roleId.trim() : '',
          requiredRoleMode:
            rule.requiredRoleMode === 'specific_role'
              ? 'specific_role'
              : 'any_role',
          requiredRoleId:
            typeof rule.requiredRoleId === 'string' && rule.requiredRoleId.trim().length > 0
              ? rule.requiredRoleId.trim()
              : null,
        };
      })
      .filter((rule) => rule.roleId.length > 0)
    : [];

  return {
    enabled: value.enabled === true,
    requiredRoleMode: value.requiredRoleMode === 'selected_roles'
      ? 'selected_roles'
      : 'all_roles',
    requiredRoleIds: Array.isArray(value.requiredRoleIds)
      ? [...new Set(value.requiredRoleIds
        .filter((id) => typeof id === 'string')
        .map((id) => id.trim())
        .filter((id) => id.length > 0))]
      : [],
    rules,
    requireAdminApproval: value.requireAdminApproval === true,
    approvalChannelId:
      typeof value.approvalChannelId === 'string' && value.approvalChannelId.trim().length > 0
        ? value.approvalChannelId.trim()
        : null,
  };
}

async function ensureVoiceAutoRoleConfigTable() {
  if (voiceAutoRoleConfigEnsured) return;
  try {
    await query(
      `
        CREATE TABLE IF NOT EXISTS voice_auto_role_config (
          guild_id TEXT PRIMARY KEY,
          config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
    );
    voiceAutoRoleConfigEnsured = true;
  } catch (error) {
    console.error('Failed to ensure voice_auto_role_config table:', error);
  }
}

async function ensureVoiceAutoRoleRequestsTable() {
  if (voiceAutoRoleRequestsEnsured) return;
  try {
    await query(
      `
        CREATE TABLE IF NOT EXISTS voice_auto_role_requests (
          id BIGSERIAL PRIMARY KEY,
          guild_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          role_id TEXT NOT NULL,
          rule_key TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          total_ms BIGINT NOT NULL DEFAULT 0,
          message_channel_id TEXT,
          message_id TEXT,
          decided_by TEXT,
          decided_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (guild_id, user_id, role_id, rule_key)
        )
      `
    );
    voiceAutoRoleRequestsEnsured = true;
  } catch (error) {
    console.error('Failed to ensure voice_auto_role_requests table:', error);
  }
}

async function ensureVoiceLeaderboardOverridesTable() {
  if (voiceLeaderboardOverridesEnsured) return;
  try {
    await query(
      `
        CREATE TABLE IF NOT EXISTS voice_leaderboard_overrides (
          guild_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          total_ms BIGINT NOT NULL DEFAULT 0,
          sessions BIGINT NOT NULL DEFAULT 0,
          is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (guild_id, user_id)
        )
      `
    );
    voiceLeaderboardOverridesEnsured = true;
  } catch (error) {
    console.error('Failed to ensure voice_leaderboard_overrides table:', error);
  }
}

async function getTempChannelsForGuild(guildId) {
  const res = await query(
    'SELECT channel_id, owner_id, created_at FROM temp_voice_channels WHERE guild_id = $1 ORDER BY created_at DESC',
    [guildId]
  );
  return res.rows;
}

async function getTempChannelByOwner(guildId, ownerId) {
  await ensureTempVoiceOwnerLookupIndex();
  const cachedChannelId = getCachedTempChannelByOwner(guildId, ownerId);
  if (cachedChannelId) {
    return cachedChannelId;
  }

  const res = await query(
    'SELECT channel_id FROM temp_voice_channels WHERE guild_id = $1 AND owner_id = $2 ORDER BY created_at DESC LIMIT 1',
    [guildId, ownerId]
  );
  const channelId = res.rows[0]?.channel_id ?? null;
  if (channelId) {
    setTempOwnerCache(guildId, ownerId, channelId);
  }
  return channelId;
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
  await ensureTempVoicePromptMessageColumn();
  let res;
  try {
    res = await query(
      'SELECT owner_id, lfg_channel_id, lfg_message_id, role_id, lfg_enabled, prompt_message_id FROM temp_voice_channels WHERE channel_id = $1',
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
    promptMessageId: row.prompt_message_id ?? null,
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
  const existingRes = await query(
    'SELECT guild_id, owner_id FROM temp_voice_channels WHERE channel_id = $1',
    [channelId]
  );
  const existing = existingRes.rows[0] || null;

  await query(
    'UPDATE temp_voice_channels SET owner_id = $1 WHERE channel_id = $2',
    [ownerId, channelId]
  );

  if (existing?.guild_id && existing?.owner_id) {
    clearTempOwnerCacheByOwner(existing.guild_id, existing.owner_id);
  } else {
    clearTempOwnerCacheByChannel(channelId);
  }
  if (existing?.guild_id) {
    setTempOwnerCache(existing.guild_id, ownerId, channelId);
  }
}

async function updateTempChannelPromptMessage(channelId, promptMessageId) {
  await ensureTempVoicePromptMessageColumn();
  await query(
    'UPDATE temp_voice_channels SET prompt_message_id = $1 WHERE channel_id = $2',
    [promptMessageId, channelId]
  );
}

async function removeTempChannel(channelId) {
  const infoRes = await query(
    'SELECT guild_id, owner_id FROM temp_voice_channels WHERE channel_id = $1',
    [channelId]
  );
  const info = infoRes.rows[0] || null;

  await clearVoiceActivity(channelId).catch(() => null);
  await query('DELETE FROM temp_voice_channels WHERE channel_id = $1', [
    channelId,
  ]);

  if (info?.guild_id && info?.owner_id) {
    clearTempOwnerCacheByOwner(info.guild_id, info.owner_id);
  }
  clearTempOwnerCacheByChannel(channelId);
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

async function getManualVoiceActivity(guildId, channelId) {
  await ensureManualVoiceActivityTable();
  await ensureManualVoiceSessionLogsTable();

  const [activeRes, historyRes] = await Promise.all([
    query(
      `
        SELECT user_id, joined_at
        FROM manual_voice_activity
        WHERE guild_id = $1
          AND channel_id = $2
        ORDER BY joined_at DESC
      `,
      [guildId, channelId]
    ),
    query(
      `
        SELECT
          user_id,
          COALESCE(SUM(total_ms), 0)::bigint AS total_ms,
          MAX(left_at) AS updated_at
        FROM manual_voice_session_logs
        WHERE guild_id = $1
          AND channel_id = $2
        GROUP BY user_id
        ORDER BY MAX(left_at) DESC
      `,
      [guildId, channelId]
    ),
  ]);

  const activeRows = activeRes.rows.map((row) => ({
    userId: row.user_id,
    isActive: true,
    joinedAt: row.joined_at ? new Date(row.joined_at) : null,
    totalMs: 0,
    updatedAt: row.joined_at ? new Date(row.joined_at) : null,
  }));

  const historyRows = historyRes.rows.map((row) => ({
    userId: row.user_id,
    isActive: false,
    joinedAt: null,
    totalMs: Number(row.total_ms) || 0,
    updatedAt: row.updated_at ? new Date(row.updated_at) : null,
  }));

  return [...activeRows, ...historyRows];
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

async function upsertManualVoiceJoin(
  guildId,
  channelId,
  userId,
  joinedAt = new Date()
) {
  await ensureManualVoiceActivityTable();
  await query(
    `
      INSERT INTO manual_voice_activity (guild_id, channel_id, user_id, joined_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT(guild_id, channel_id, user_id) DO UPDATE SET
        joined_at = EXCLUDED.joined_at,
        updated_at = NOW()
    `,
    [guildId, channelId, userId, joinedAt]
  );
}

async function clearManualVoiceActiveEntry(guildId, channelId, userId) {
  await ensureManualVoiceActivityTable();
  await query(
    `
      DELETE FROM manual_voice_activity
      WHERE guild_id = $1
        AND channel_id = $2
        AND user_id = $3
    `,
    [guildId, channelId, userId]
  );
}

async function finalizeManualVoiceSession(
  guildId,
  channelId,
  userId,
  channelName = null,
  leftAt = new Date()
) {
  await ensureManualVoiceActivityTable();
  await ensureManualVoiceSessionLogsTable();
  const res = await query(
    `
      WITH ended AS (
        DELETE FROM manual_voice_activity
        WHERE guild_id = $1 AND channel_id = $2 AND user_id = $3
        RETURNING joined_at
      )
      INSERT INTO manual_voice_session_logs (
        guild_id,
        channel_id,
        channel_name,
        owner_id,
        user_id,
        joined_at,
        left_at,
        total_ms,
        created_at
      )
      SELECT
        $1,
        $2,
        $4,
        'server_owned',
        $3,
        ended.joined_at,
        $5,
        GREATEST(
          0,
          FLOOR(EXTRACT(EPOCH FROM ($5::timestamptz - ended.joined_at)) * 1000)
        )::BIGINT,
        NOW()
      FROM ended
      RETURNING channel_id, channel_name, owner_id, user_id, joined_at, left_at, total_ms
    `,
    [guildId, channelId, userId, channelName, leftAt]
  );

  const row = res.rows[0];
  if (!row) {
    return null;
  }

  return {
    channelId: row.channel_id,
    channelName: row.channel_name,
    ownerId: row.owner_id,
    userId: row.user_id,
    joinedAt: row.joined_at ? new Date(row.joined_at) : null,
    leftAt: row.left_at ? new Date(row.left_at) : leftAt,
    totalMs: Number(row.total_ms || 0),
  };
}

async function getVoiceStatsForUser(guildId, userId) {
  await ensureTempVoiceActivityTable();
  await ensureTempVoiceDeleteLogsTable();
  await ensureManualVoiceActivityTable();
  await ensureManualVoiceSessionLogsTable();

  const summaryRes = await query(
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
      ),
      leaderboard AS (
        SELECT
          user_id,
          SUM(total_ms)::bigint AS total_ms,
          COUNT(*)::bigint AS sessions,
          MAX(total_ms)::bigint AS longest_ms
        FROM all_sessions
        GROUP BY user_id
      ),
      ranked AS (
        SELECT
          user_id,
          ROW_NUMBER() OVER (
            ORDER BY total_ms DESC, sessions DESC, user_id ASC
          ) AS rank_position
        FROM leaderboard
      ),
      target AS (
        SELECT
          COALESCE(l.total_ms, 0)::bigint AS total_ms,
          COALESCE(l.sessions, 0)::bigint AS sessions,
          COALESCE(l.longest_ms, 0)::bigint AS longest_ms,
          r.rank_position
        FROM (SELECT $2::text AS user_id) u
        LEFT JOIN leaderboard l ON l.user_id = u.user_id
        LEFT JOIN ranked r ON r.user_id = u.user_id
      )
      SELECT total_ms, sessions, longest_ms, rank_position
      FROM target
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

  const manualActiveRes = await query(
    `
      SELECT channel_id, joined_at
      FROM manual_voice_activity
      WHERE guild_id = $1
        AND user_id = $2
      ORDER BY joined_at DESC
      LIMIT 1
    `,
    [guildId, userId]
  );

  const summary = summaryRes.rows[0] || {};
  const tempActive = activeRes.rows[0] || null;
  const manualActive = manualActiveRes.rows[0] || null;
  let active = null;

  if (tempActive && manualActive) {
    const tempTime = tempActive.joined_at
      ? new Date(tempActive.joined_at).getTime()
      : 0;
    const manualTime = manualActive.joined_at
      ? new Date(manualActive.joined_at).getTime()
      : 0;
    active = manualTime > tempTime
      ? {
          channel_id: manualActive.channel_id,
          joined_at: manualActive.joined_at,
          total_ms: 0,
        }
      : tempActive;
  } else if (tempActive) {
    active = tempActive;
  } else if (manualActive) {
    active = {
      channel_id: manualActive.channel_id,
      joined_at: manualActive.joined_at,
      total_ms: 0,
    };
  }

  return {
    totalMs: Number(summary.total_ms || 0),
    sessions: Number(summary.sessions || 0),
    longestMs: Number(summary.longest_ms || 0),
    ownerCount: Number(ownerRes.rows[0]?.owner_count || 0),
    rank: Number(summary.rank_position || 0) || null,
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
  await ensureManualVoiceSessionLogsTable();
  const safeLimit = Number.isFinite(limit)
    ? Math.min(50, Math.max(1, Math.floor(limit)))
    : 10;

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
  getVoiceAutoRoleConfig,
  getGuildVoiceTotals,
  getVoiceAutoRoleRequest,
  getVoiceAutoRoleRequestById,
  createOrGetVoiceAutoRoleRequest,
  updateVoiceAutoRoleRequestMessage,
  updateVoiceAutoRoleRequestStatus,
  addTempChannel,
  clearPersistentLfgMessage,
  clearManualVoicePanelMessage,
  getPersistentLfgMessage,
  getManualVoicePanelMessage,
  getTempChannelsForGuild,
  getTempChannelByOwner,
  getTempChannelOwner,
  getTempChannelInfo,
  getVoiceActivity,
  getManualVoiceActivity,
  finalizeVoiceActivity,
  markVoiceLeave,
  removeTempChannel,
  setPersistentLfgMessage,
  setManualVoicePanelMessage,
  upsertVoiceJoin,
  updateTempChannelMessage,
  updateTempChannelOwner,
  updateTempChannelPromptMessage,
  clearVoiceActivity,
  addTempVoiceDeleteLog,
  finalizeManualVoiceSession,
  getVoiceLeaderboard,
  getVoiceStatsForUser,
  upsertManualVoiceJoin,
  clearManualVoiceActiveEntry,
};
