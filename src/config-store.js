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

async function getGuildConfig(guildId) {
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


async function addTempChannel(guildId, channelId, ownerId, roleId = null) {
  await query(
    `
      INSERT INTO temp_voice_channels (
        guild_id,
        channel_id,
        owner_id,
        created_at,
        role_id
      )
      VALUES ($1, $2, $3, NOW(), $4)
      ON CONFLICT(channel_id) DO UPDATE SET
        guild_id = EXCLUDED.guild_id,
        owner_id = EXCLUDED.owner_id,
        created_at = EXCLUDED.created_at,
        role_id = EXCLUDED.role_id
    `,
    [guildId, channelId, ownerId, roleId]
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
  const res = await query(
    'SELECT owner_id, lfg_channel_id, lfg_message_id, role_id FROM temp_voice_channels WHERE channel_id = $1',
    [channelId]
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    ownerId: row.owner_id,
    lfgChannelId: row.lfg_channel_id ?? null,
    lfgMessageId: row.lfg_message_id ?? null,
    roleId: row.role_id ?? null,
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
  await query('DELETE FROM temp_voice_channels WHERE channel_id = $1', [
    channelId,
  ]);
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
  removeTempChannel,
  setPersistentLfgMessage,
  updateTempChannelMessage,
  updateTempChannelOwner,
};
