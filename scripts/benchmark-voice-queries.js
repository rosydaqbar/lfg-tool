require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { buildPgSslConfig } = require('../src/lib/pg-ssl');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL in environment.');
  process.exit(1);
}

function stringifyPlan(rows) {
  return rows.map((row) => row['QUERY PLAN']).join('\n');
}

function extractExecutionTimeMs(planText) {
  const match = planText.match(/Execution Time:\s*([0-9.]+)\s*ms/i);
  if (!match) return null;
  return Number(match[1]);
}

async function queryPlan(client, sql, params) {
  const res = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${sql}`, params);
  return stringifyPlan(res.rows);
}

async function main() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: buildPgSslConfig(),
  });

  const client = await pool.connect();
  try {
    const guildRes = await client.query(
      `
        SELECT guild_id
        FROM (
          SELECT guild_id, MAX(deleted_at) AS event_at FROM temp_voice_delete_logs GROUP BY guild_id
          UNION ALL
          SELECT guild_id, MAX(left_at) AS event_at FROM manual_voice_session_logs GROUP BY guild_id
        ) combined
        WHERE guild_id IS NOT NULL
        ORDER BY event_at DESC NULLS LAST
        LIMIT 1
      `
    );

    const guildId = guildRes.rows[0]?.guild_id;
    if (!guildId) {
      console.log('No guild data found; skipping benchmark capture.');
      return;
    }

    const userRes = await client.query(
      `
        SELECT user_id
        FROM (
          SELECT elem->>'userId' AS user_id
          FROM temp_voice_delete_logs logs
          CROSS JOIN LATERAL jsonb_array_elements(logs.history_json) elem
          WHERE logs.guild_id = $1 AND elem ? 'userId'
          UNION ALL
          SELECT user_id FROM manual_voice_session_logs WHERE guild_id = $1
        ) users
        WHERE user_id IS NOT NULL
        LIMIT 1
      `,
      [guildId]
    );
    const userId = userRes.rows[0]?.user_id || 'unknown';

    const statsSqlOptimized = `
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
    `;

    const statsSqlLegacyAggregate = `
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
        COALESCE(SUM(total_ms), 0)::bigint AS total_ms,
        COUNT(*)::bigint AS sessions,
        COALESCE(MAX(total_ms), 0)::bigint AS longest_ms
      FROM all_sessions
      WHERE user_id = $2
    `;

    const statsSqlLegacyRank = `
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
          COUNT(*)::bigint AS sessions
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
      )
      SELECT rank_position
      FROM ranked
      WHERE user_id = $2
    `;

    const mixedLogSql = `
      SELECT
        source_type,
        row_id,
        channel_id,
        channel_name,
        owner_id,
        event_at,
        joined_at,
        left_at,
        history_json
      FROM (
        SELECT
          'temp_deleted'::text AS source_type,
          id AS row_id,
          channel_id,
          channel_name,
          owner_id,
          deleted_at AS event_at,
          NULL::timestamptz AS joined_at,
          NULL::timestamptz AS left_at,
          history_json
        FROM temp_voice_delete_logs
        WHERE guild_id = $1

        UNION ALL

        SELECT
          'manual_session'::text AS source_type,
          id AS row_id,
          channel_id,
          channel_name,
          owner_id,
          left_at AS event_at,
          joined_at,
          left_at,
          jsonb_build_array(
            jsonb_build_object('userId', user_id, 'totalMs', total_ms)
          ) AS history_json
        FROM manual_voice_session_logs
        WHERE guild_id = $1
      ) combined
      ORDER BY event_at DESC
      LIMIT 100
      OFFSET 0
    `;

    const [statsPlanOptimized, statsPlanLegacyAggregate, statsPlanLegacyRank, mixedLogPlan] = await Promise.all([
      queryPlan(client, statsSqlOptimized, [guildId, userId]),
      queryPlan(client, statsSqlLegacyAggregate, [guildId, userId]),
      queryPlan(client, statsSqlLegacyRank, [guildId, userId]),
      queryPlan(client, mixedLogSql, [guildId]),
    ]);

    const optimizedMs = extractExecutionTimeMs(statsPlanOptimized);
    const legacyAggregateMs = extractExecutionTimeMs(statsPlanLegacyAggregate);
    const legacyRankMs = extractExecutionTimeMs(statsPlanLegacyRank);
    const legacyCombinedMs =
      legacyAggregateMs !== null && legacyRankMs !== null
        ? legacyAggregateMs + legacyRankMs
        : null;

    const outDir = path.resolve(__dirname, '..', 'docs', 'perf');
    fs.mkdirSync(outDir, { recursive: true });
    const now = new Date();
    const fileName = `voice-query-benchmark-${now.toISOString().replace(/[:.]/g, '-')}.md`;
    const filePath = path.join(outDir, fileName);

    const content = [
      '# Voice Query Benchmark',
      '',
      `- Captured at: ${now.toISOString()}`,
      `- guildId: ${guildId}`,
      `- userId sample: ${userId}`,
      optimizedMs !== null ? `- Optimized stats execution: ${optimizedMs.toFixed(3)} ms` : '- Optimized stats execution: n/a',
      legacyCombinedMs !== null
        ? `- Legacy stats execution (aggregate + rank): ${legacyCombinedMs.toFixed(3)} ms`
        : '- Legacy stats execution (aggregate + rank): n/a',
      '',
      '## Stats Query Plan (Optimized)',
      '```text',
      statsPlanOptimized,
      '```',
      '',
      '## Stats Query Plan (Legacy Aggregate)',
      '```text',
      statsPlanLegacyAggregate,
      '```',
      '',
      '## Stats Query Plan (Legacy Rank)',
      '```text',
      statsPlanLegacyRank,
      '```',
      '',
      '## Mixed Voice Log Query Plan',
      '```text',
      mixedLogPlan,
      '```',
      '',
    ].join('\n');

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Wrote benchmark file: ${filePath}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Failed to run benchmark:', error);
  process.exit(1);
});
