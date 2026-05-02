import { NextResponse } from "next/server";
import { Pool } from "pg";
import { buildPgSslConfig } from "@/lib/pg-ssl";
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

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: buildPgSslConfig(),
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
    const hint = provider === "supabase"
      ? "For Supabase, use the Transaction pooler URL (port 6543) and include sslmode=require."
      : null;
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
