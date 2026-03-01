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
let tempVoiceDeleteLogsEnsured = false;

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

type DeleteLogRow = {
  id: string | number;
  channel_id: string;
  channel_name: string | null;
  owner_id: string;
  deleted_at: string;
  history_json: unknown;
};

export async function getTempVoiceDeleteLogs(
  guildId: string,
  limit = 100,
  offset = 0
) {
  await ensureTempVoiceDeleteLogsTable();
  const safeLimit = Number.isFinite(limit)
    ? Math.min(200, Math.max(1, Math.floor(limit)))
    : 100;
  const safeOffset = Number.isFinite(offset)
    ? Math.max(0, Math.floor(offset))
    : 0;

  const res = await query(
    `
      SELECT id, channel_id, channel_name, owner_id, deleted_at, history_json
      FROM temp_voice_delete_logs
      WHERE guild_id = $1
      ORDER BY deleted_at DESC
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
      id: String(row.id),
      channelId: row.channel_id,
      channelName: row.channel_name,
      ownerId: row.owner_id,
      deletedAt: row.deleted_at,
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
  await ensureTempVoiceDeleteLogsTable();
  const safeLimit = Number.isFinite(limit)
    ? Math.min(200, Math.max(1, Math.floor(limit)))
    : 20;
  const safeOffset = Number.isFinite(offset)
    ? Math.max(0, Math.floor(offset))
    : 0;

  const res = await query(
    `
      SELECT
        elem->>'userId' AS user_id,
        SUM(
          CASE
            WHEN (elem->>'totalMs') ~ '^[0-9]+$'
              THEN (elem->>'totalMs')::bigint
            ELSE 0
          END
        ) AS total_ms,
        COUNT(*)::bigint AS sessions
      FROM temp_voice_delete_logs logs
      CROSS JOIN LATERAL jsonb_array_elements(logs.history_json) elem
      WHERE logs.guild_id = $1
        AND elem ? 'userId'
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
