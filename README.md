# Discord LFG Voice Bot + Dashboard

Join-to-Create voice bot with LFG flow and a dashboard to manage channels.

## Features
- Voice join logging with a per-channel watchlist
- Join-to-Create lobbies (creates per-user channel, copies settings, deletes when empty)
- LFG flow (prompt in voice chat, modal custom message, posts to LFG channel)
- LFG post cooldown: 10 minutes per user
- Persistent LFG message in LFG channel (refreshes every 1 minute)
- Active temp channel tracking and disband edits
- Dashboard configuration + resource monitor (bot + dashboard)

## Setup (Bot)
1. Install dependencies:
   - `npm install`
2. Configure environment:
   - `cp .env.example .env`
   - Set `DISCORD_TOKEN` (used by bot and dashboard)
   - Set `DATABASE_URL` (Supabase Postgres, use `?sslmode=require`)
   - Optional: `LOG_CHANNEL_ID` fallback log channel
   - Optional: `VOICE_CHANNEL_ID` fallback single-channel logging
   - Optional: `DEBUG=true`
3. Start the bot:
   - `npm start`

## Required Intents and Permissions
- Gateway intents: `Guilds`, `GuildVoiceStates`
- Bot permissions:
  - `View Channel`, `Send Messages` (log channel, LFG channel, voice channel chat)
  - `Manage Channels`, `Move Members` (Join-to-Create)

## LFG Flow
- User joins a Join-to-Create lobby:
  - Bot creates a voice channel named after the user, copies settings, and moves them.
  - Bot sends a prompt in that voice channel chat referencing the LFG channel.
- User clicks "Send LFG Post":
  - Modal collects a custom message.
  - Post is sent to the LFG channel (or log channel if not set).

LFG message format:
```text
<@&ROLE_ID>
<@user> mencari squad, join: https://discordapp.com/channels/{guildID}/{voiceChannelID}

-# Pesan:
> user message

-# Dibuat pada: <t:timestamp:f>
-# Info lebih lanjut: <@user>
```

## Persistent LFG Message
Every 1 minute the bot ensures a message at the bottom of the LFG channel:
```text
Untuk mencari teman/squad baru, silahkan buat voice channel terlebih dahulu: <links>
```
The red embed lists active temp channels and available slots, or:
`*Tidak ada squad yang tersedia*`
Footer: `Klik salah satu voice diatas untuk join squad`

## Dashboard (Next.js + shadcn/ui)
The dashboard lives in `dashboard` and controls logging configuration stored in Postgres.
It is locked to guild ID `670147766839803924` in the UI.

Key controls:
- Log Channel and LFG Channel (optional; fallback to log channel)
- Join-to-Create lobby toggles
- Voice log watchlist
- Active temp channel list (clickable voice tags)
- Resource monitor for bot + dashboard (updates every 5s)

Setup:
1. Install dependencies:
   - `cd dashboard`
   - `npm install`
2. Configure environment:
   - The dashboard loads the repo root `.env` automatically.
   - Set `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` in the root `.env`.
   - Ensure `DISCORD_TOKEN` is set for channel discovery.
   - Set `NEXTAUTH_SECRET` and `NEXTAUTH_URL`.
   - Set `ADMIN_DISCORD_USER_ID`.
   - Set `DATABASE_URL` (same as bot).
3. Start the dashboard:
   - `npm run dev`

## Data
Primary storage is Postgres via `DATABASE_URL` (Supabase).

One-time migration from SQLite:
```bash
DATABASE_URL="postgresql://..." SQLITE_PATH=./data/discord.db node scripts/migrate-sqlite-to-postgres.js
```
