const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
const SQLITE_PATH = process.env.SQLITE_PATH || './data/discord.db';

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL in environment.');
  process.exit(1);
}

const sqlitePath = path.resolve(process.cwd(), SQLITE_PATH);
if (!fs.existsSync(sqlitePath)) {
  console.error(`SQLite DB not found at ${sqlitePath}`);
  process.exit(1);
}

const schemaPath = path.resolve(__dirname, 'schema-postgres.sql');
if (!fs.existsSync(schemaPath)) {
  console.error('Missing schema-postgres.sql file.');
  process.exit(1);
}

const sqlite = new Database(sqlitePath, { readonly: true });
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function readTable(table) {
  return sqlite.prepare(`SELECT * FROM ${table}`).all();
}

async function main() {
  const schema = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(schema);

  const guildConfig = readTable('guild_config');
  const voiceWatchlist = readTable('voice_watchlist');
  const jtcLobbies = readTable('join_to_create_lobbies');
  const tempVoice = readTable('temp_voice_channels');
  const persistent = readTable('lfg_persistent_message');

  const client = await pool.connect();
  await client.query('BEGIN');
  try {
    await client.query('DELETE FROM voice_watchlist');
    await client.query('DELETE FROM join_to_create_lobbies');
    await client.query('DELETE FROM temp_voice_channels');
    await client.query('DELETE FROM lfg_persistent_message');
    await client.query('DELETE FROM guild_config');

    for (const row of guildConfig) {
      await client.query(
        `
          INSERT INTO guild_config (guild_id, log_channel_id, lfg_channel_id, updated_at)
          VALUES ($1, $2, $3, $4)
        `,
        [
          row.guild_id,
          row.log_channel_id,
          row.lfg_channel_id ?? null,
          row.updated_at,
        ]
      );
    }

    for (const row of voiceWatchlist) {
      await client.query(
        `
          INSERT INTO voice_watchlist (guild_id, voice_channel_id, enabled)
          VALUES ($1, $2, $3)
        `,
        [row.guild_id, row.voice_channel_id, Boolean(row.enabled)]
      );
    }

    for (const row of jtcLobbies) {
      await client.query(
        `
          INSERT INTO join_to_create_lobbies (guild_id, lobby_channel_id, role_id, lfg_enabled)
          VALUES ($1, $2, $3, $4)
        `,
        [
          row.guild_id,
          row.lobby_channel_id,
          row.role_id ?? null,
          typeof row.lfg_enabled === 'number'
            ? Boolean(row.lfg_enabled)
            : true,
        ]
      );
    }

    for (const row of tempVoice) {
      await client.query(
        `
          INSERT INTO temp_voice_channels (
            guild_id,
            channel_id,
            owner_id,
            created_at,
            lfg_channel_id,
            lfg_message_id,
            role_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          row.guild_id,
          row.channel_id,
          row.owner_id,
          row.created_at,
          row.lfg_channel_id ?? null,
          row.lfg_message_id ?? null,
          null,
        ]
      );
    }

    for (const row of persistent) {
      await client.query(
        `
          INSERT INTO lfg_persistent_message (guild_id, channel_id, message_id, updated_at)
          VALUES ($1, $2, $3, $4)
        `,
        [row.guild_id, row.channel_id, row.message_id, row.updated_at]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
    sqlite.close();
  }

  console.log('Migration complete.');
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
