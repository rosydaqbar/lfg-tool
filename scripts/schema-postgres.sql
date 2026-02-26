CREATE TABLE IF NOT EXISTS guild_config (
  guild_id TEXT PRIMARY KEY,
  log_channel_id TEXT NOT NULL,
  lfg_channel_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS voice_watchlist (
  guild_id TEXT NOT NULL,
  voice_channel_id TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (guild_id, voice_channel_id)
);

CREATE TABLE IF NOT EXISTS join_to_create_lobbies (
  guild_id TEXT NOT NULL,
  lobby_channel_id TEXT NOT NULL,
  role_id TEXT,
  lfg_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (guild_id, lobby_channel_id)
);

ALTER TABLE IF EXISTS join_to_create_lobbies
  ADD COLUMN IF NOT EXISTS role_id TEXT;

ALTER TABLE IF EXISTS join_to_create_lobbies
  ADD COLUMN IF NOT EXISTS lfg_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS temp_voice_channels (
  guild_id TEXT NOT NULL,
  channel_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  lfg_channel_id TEXT,
  lfg_message_id TEXT,
  role_id TEXT,
  lfg_enabled BOOLEAN NOT NULL DEFAULT TRUE
);

ALTER TABLE IF EXISTS temp_voice_channels
  ADD COLUMN IF NOT EXISTS role_id TEXT;

ALTER TABLE IF EXISTS temp_voice_channels
  ADD COLUMN IF NOT EXISTS lfg_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS lfg_persistent_message (
  guild_id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS temp_voice_activity (
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  joined_at TIMESTAMPTZ,
  total_ms BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS temp_voice_delete_logs (
  id BIGSERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  channel_name TEXT,
  owner_id TEXT NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  history_json JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_voice_watchlist_guild ON voice_watchlist(guild_id);
CREATE INDEX IF NOT EXISTS idx_jtc_lobbies_guild ON join_to_create_lobbies(guild_id);
CREATE INDEX IF NOT EXISTS idx_temp_voice_guild ON temp_voice_channels(guild_id);
CREATE INDEX IF NOT EXISTS idx_temp_voice_activity_channel ON temp_voice_activity(channel_id);
CREATE INDEX IF NOT EXISTS idx_temp_voice_delete_logs_guild_deleted ON temp_voice_delete_logs(guild_id, deleted_at DESC);
CREATE INDEX IF NOT EXISTS idx_temp_voice_delete_logs_channel ON temp_voice_delete_logs(channel_id);
