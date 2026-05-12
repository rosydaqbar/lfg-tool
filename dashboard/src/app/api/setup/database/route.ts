import { NextResponse } from "next/server";
import { Pool } from "pg";
import { buildPgSslConfig, sanitizePgConnectionString } from "@/lib/pg-ssl";
import { getGuildConfig, getSetupState, updateSetupState } from "@/lib/db";
import { encryptSetupValue } from "@/lib/setup-crypto";
import { requireSetupSession } from "@/lib/setup-session";

export const dynamic = "force-dynamic";

async function hydrateSetupChannelsFromExistingConfig() {
  const setup = await getSetupState();
  const selectedGuildId = (setup.selectedGuildId || "").trim();
  if (!selectedGuildId) return;

  try {
    const config = await getGuildConfig(selectedGuildId);
    await updateSetupState({
      logChannelId: config.logChannelId,
      lfgChannelId: config.lfgChannelId,
    });
  } catch {
    // ignore hydration errors; setup database validation can still succeed
  }
}

const BASELINE_SCHEMA = [
  `
    CREATE TABLE IF NOT EXISTS guild_config (
      guild_id TEXT PRIMARY KEY,
      log_channel_id TEXT,
      lfg_channel_id TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS voice_watchlist (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      voice_channel_id TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS join_to_create_lobbies (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      lobby_channel_id TEXT NOT NULL,
      role_id TEXT,
      lfg_enabled BOOLEAN NOT NULL DEFAULT TRUE
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS voice_auto_role_config (
      guild_id TEXT PRIMARY KEY,
      config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `,
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
  `,
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
  `,
];

function getSupabaseUrlProblem(databaseUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    return "Use a full Postgres connection string, for example postgresql://postgres.project-ref:password@aws-0-region.pooler.supabase.com:6543/postgres?sslmode=require.";
  }

  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    return "Database URL must start with postgresql://.";
  }

  if (!parsed.hostname.includes("pooler.supabase.com")) {
    return "Use the Supabase Transaction Pooler host. It should end with pooler.supabase.com.";
  }

  if (parsed.port !== "6543") {
    return "Use the Supabase Transaction Pooler URL on port 6543, not the direct database URL or session pooler port.";
  }

  if (parsed.pathname !== "/postgres") {
    return "The database path should be /postgres.";
  }

  if (parsed.searchParams.get("sslmode") !== "require") {
    return "Add sslmode=require to the URL query string.";
  }

  const username = decodeURIComponent(parsed.username || "");
  if (!username.startsWith("postgres.")) {
    return "For Supabase pooler URLs, the username should look like postgres.project-ref, not just postgres.";
  }

  if (!parsed.password) {
    return "Database password is missing. If your password contains special characters, URL-encode it before pasting the URL.";
  }

  return null;
}

function getDatabaseErrorHint(details: string) {
  const lower = details.toLowerCase();
  if (lower.includes("self-signed certificate") || lower.includes("certificate chain")) {
    return "Supabase Transaction Pooler with sslmode=require needs encrypted SSL without CA verification. Set PG_SSL_MODE=require and PG_SSL_REJECT_UNAUTHORIZED=false, or keep using the setup wizard which applies that mode for validation.";
  }
  if (lower.includes("tenant") || lower.includes("user") || lower.includes("enotfound")) {
    return "Check that the pooler username and host belong to the same Supabase project. The username should be postgres.<project-ref>, and the host should be the Transaction Pooler host from that same project.";
  }
  if (lower.includes("password") || lower.includes("authentication")) {
    return "Check the database password. If it contains characters like @, #, :, /, or %, URL-encode the password in the connection string.";
  }
  if (lower.includes("timeout") || lower.includes("econnrefused")) {
    return "Check that you are using the Supabase Transaction Pooler URL on port 6543 and that your network can reach Supabase.";
  }
  return "For Supabase, use the Transaction Pooler URL (port 6543) and include sslmode=require.";
}

function buildSetupPgSslConfig(databaseUrl: string) {
  const parsed = new URL(databaseUrl);
  const sslMode = parsed.searchParams.get("sslmode")?.toLowerCase();
  if (sslMode === "require") {
    return { rejectUnauthorized: false };
  }
  return buildPgSslConfig();
}

export async function POST(request: Request) {
  const auth = await requireSetupSession();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
      | {
          provider?: "supabase";
          databaseUrl?: string;
          applySchema?: boolean;
        }
    | null;

  const provider = body?.provider;
  const databaseUrl = (body?.databaseUrl || "").trim();
  const applySchema = body?.applySchema === true;

  if (provider !== "supabase") {
    return NextResponse.json({ error: "Only Supabase is supported." }, { status: 400 });
  }

  if (!databaseUrl) {
    return NextResponse.json({ error: "databaseUrl is required" }, { status: 400 });
  }

  const supabaseUrlProblem = getSupabaseUrlProblem(databaseUrl);
  if (supabaseUrlProblem) {
    return NextResponse.json(
      {
        error: "Invalid Supabase database URL.",
        details: supabaseUrlProblem,
        hint: "Copy the Transaction Pooler connection string from Supabase Project Settings > Database > Connection string > Transaction pooler.",
      },
      { status: 400 }
    );
  }

  const pool = new Pool({
    connectionString: sanitizePgConnectionString(databaseUrl),
    ssl: buildSetupPgSslConfig(databaseUrl),
    max: 1,
    connectionTimeoutMillis: 8_000,
  });

  try {
    await pool.query("SELECT 1");
    if (applySchema) {
      for (const sql of BASELINE_SCHEMA) {
        await pool.query(sql);
      }
    }
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown database error";
    const hint = getDatabaseErrorHint(details);
    return NextResponse.json(
      {
        error: "Failed to connect to database. Verify URL and SSL settings.",
        details,
        hint,
      },
      { status: 400 }
    );
  } finally {
    await pool.end().catch(() => null);
  }

  const encryptedUrl = encryptSetupValue(databaseUrl);
  await updateSetupState({
    databaseProvider: provider,
    databaseUrlEncrypted: encryptedUrl,
    databaseUrl,
    databaseValidatedAt: new Date().toISOString(),
  });

  await hydrateSetupChannelsFromExistingConfig();

  const setup = await getSetupState();
  return NextResponse.json({ ok: true, setup });
}
