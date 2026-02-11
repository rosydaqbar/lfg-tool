import "@/lib/env";
import { Pool } from "pg";

type GuildConfig = {
  logChannelId: string | null;
  lfgChannelId: string | null;
  enabledVoiceChannelIds: string[];
  joinToCreateLobbies: { channelId: string; roleId: string | null }[];
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

export async function getGuildConfig(guildId: string): Promise<GuildConfig> {
  const configRes = await query(
    "SELECT log_channel_id, lfg_channel_id FROM guild_config WHERE guild_id = $1",
    [guildId]
  );
  const configRow = configRes.rows[0] ?? {};

  const watchlistRes = await query(
    "SELECT voice_channel_id FROM voice_watchlist WHERE guild_id = $1 AND enabled = true",
    [guildId]
  );

  const lobbyRes = await query(
    "SELECT lobby_channel_id, role_id FROM join_to_create_lobbies WHERE guild_id = $1",
    [guildId]
  );

  return {
    logChannelId: configRow.log_channel_id ?? null,
    lfgChannelId: configRow.lfg_channel_id ?? null,
    enabledVoiceChannelIds: watchlistRes.rows.map(
      (row) => row.voice_channel_id
    ),
    joinToCreateLobbies: lobbyRes.rows.map((row) => ({
      channelId: row.lobby_channel_id,
      roleId: row.role_id ?? null,
    })),
  };
}

export async function saveGuildConfig(guildId: string, config: GuildConfig) {
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
      await client.query(
        "INSERT INTO join_to_create_lobbies (guild_id, lobby_channel_id, role_id) VALUES ($1, $2, $3)",
        [guildId, lobby.channelId, lobby.roleId]
      );
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

export async function setProcessMetrics(
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
  await query(
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT(service) DO UPDATE SET
        pid = EXCLUDED.pid,
        cpu_percent = EXCLUDED.cpu_percent,
        memory_rss = EXCLUDED.memory_rss,
        memory_heap_used = EXCLUDED.memory_heap_used,
        memory_heap_total = EXCLUDED.memory_heap_total,
        uptime_seconds = EXCLUDED.uptime_seconds,
        updated_at = EXCLUDED.updated_at
    `,
    [
      service,
      metrics.pid,
      metrics.cpuPercent,
      metrics.memoryRss,
      metrics.memoryHeapUsed,
      metrics.memoryHeapTotal,
      metrics.uptimeSeconds,
    ]
  );
}

export async function getProcessMetrics() {
  const res = await query(
    `
      SELECT service, pid, cpu_percent, memory_rss, memory_heap_used,
             memory_heap_total, uptime_seconds, updated_at
      FROM process_metrics
    `
  );
  return res.rows as {
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
