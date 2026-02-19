import "@/lib/env";
import { Pool } from "pg";

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

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL in environment.");
}

const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  : null;

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

let lfgEnabledColumnEnsured = false;

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

export async function getGuildConfig(guildId: string): Promise<GuildConfig> {
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

export async function saveGuildConfig(guildId: string, config: GuildConfig) {
  await ensureJoinToCreateLfgEnabledColumn();
  if (!config.logChannelId) {
    throw new Error("logChannelId is required");
  }
  if (config.joinToCreateLobbies.some((item) => !item.roleId)) {
    throw new Error("joinToCreateLobbies requires a role for each lobby");
  }

  const db = await getPool();
  const client = await db.connect();
  try {
    await client.query("BEGIN");

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
    const hasLfgEnabledColumn =
      lfgEnabledColumnRes.rows[0]?.has_lfg_enabled === true;

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

    await client.query("DELETE FROM voice_watchlist WHERE guild_id = $1", [
      guildId,
    ]);
    for (const channelId of config.enabledVoiceChannelIds) {
      await client.query(
        "INSERT INTO voice_watchlist (guild_id, voice_channel_id, enabled) VALUES ($1, $2, true)",
        [guildId, channelId]
      );
    }

    await client.query("DELETE FROM join_to_create_lobbies WHERE guild_id = $1", [
      guildId,
    ]);
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

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getTempChannels(guildId: string) {
  const res = await query(
    `
      SELECT channel_id, owner_id, created_at, lfg_channel_id, lfg_message_id
      FROM temp_voice_channels
      WHERE guild_id = $1
      ORDER BY created_at DESC
    `,
    [guildId]
  );
  return res.rows as {
    channel_id: string;
    owner_id: string;
    created_at: string;
    lfg_channel_id: string | null;
    lfg_message_id: string | null;
  }[];
}
