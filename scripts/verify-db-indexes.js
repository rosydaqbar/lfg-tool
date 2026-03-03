require('dotenv').config();

const { Pool } = require('pg');
const { buildPgSslConfig } = require('../src/lib/pg-ssl');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL in environment.');
  process.exit(1);
}

const expectedIndexes = [
  'idx_voice_watchlist_guild',
  'idx_jtc_lobbies_guild',
  'idx_temp_voice_guild',
  'idx_temp_voice_guild_owner_created',
  'idx_temp_voice_activity_channel',
  'idx_temp_voice_activity_user_active',
  'idx_temp_voice_delete_logs_guild_deleted',
  'idx_temp_voice_delete_logs_channel',
  'idx_manual_voice_activity_guild_user',
  'idx_manual_voice_activity_guild_channel_joined',
  'idx_manual_voice_session_logs_guild_left',
  'idx_manual_voice_session_logs_user',
  'idx_manual_voice_session_logs_guild_channel_user',
  'idx_manual_voice_panel_guild_channel',
];

async function main() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: buildPgSslConfig(),
  });

  try {
    const res = await pool.query(
      `
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
      `
    );

    const existing = new Set(res.rows.map((row) => row.indexname));
    const missing = expectedIndexes.filter((name) => !existing.has(name));

    if (missing.length > 0) {
      console.error('Missing expected indexes:');
      for (const name of missing) {
        console.error(`- ${name}`);
      }
      process.exitCode = 1;
      return;
    }

    console.log('All expected indexes are present.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Failed to verify indexes:', error);
  process.exit(1);
});
