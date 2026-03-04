import { NextResponse } from "next/server";
import { Pool } from "pg";
import { buildPgSslConfig } from "@/lib/pg-ssl";
import { getSetupState, updateSetupState } from "@/lib/db";
import { encryptSetupValue } from "@/lib/setup-crypto";
import { requireSetupSession } from "@/lib/setup-session";

export const dynamic = "force-dynamic";

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
];

export async function POST(request: Request) {
  const auth = await requireSetupSession();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        provider?: "local_postgres" | "supabase";
        databaseUrl?: string;
        applySchema?: boolean;
      }
    | null;

  const provider = body?.provider;
  const databaseUrl = (body?.databaseUrl || "").trim();
  const applySchema = body?.applySchema === true;

  if (!provider || (provider !== "local_postgres" && provider !== "supabase")) {
    return NextResponse.json({ error: "Invalid database provider" }, { status: 400 });
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
  } catch {
    return NextResponse.json(
      { error: "Failed to connect to database. Verify URL and SSL settings." },
      { status: 400 }
    );
  } finally {
    await pool.end().catch(() => null);
  }

  const encryptedUrl = encryptSetupValue(databaseUrl);
  await updateSetupState({
    databaseProvider: provider,
    databaseUrlEncrypted: encryptedUrl,
    databaseValidatedAt: new Date().toISOString(),
  });

  const setup = await getSetupState();
  return NextResponse.json({ ok: true, setup });
}
