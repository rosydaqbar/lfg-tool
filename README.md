# Discord LFG Voice Bot + Dashboard

> IMPORTANT NOTICE
>
> This project was vibe-coded and iterated quickly. It works, but please use it wisely: review changes before production use, validate permissions, and test in a safe server first.

Join-to-Create Discord voice bot with LFG flow, global voice stats, manual voice-session logging, and a Next.js dashboard for configuration and monitoring.

## Current Features

- Join-to-Create lobbies
  - Creates per-user temp voice channels from lobby join
  - Moves owner into new temp channel
  - Deletes temp channel when empty
  - Supports role pairing per lobby
  - Supports per-lobby `lfg_enabled`
- Temp channel voice settings panel (in voice chat)
  - Rename, size limit, lock/unlock, transfer owner, claim owner, region
  - `My Stats` button in panel
  - Prompt auto-refreshes on relevant state changes
- LFG flow
  - Send LFG post via modal from temp channel prompt
  - Cooldown enforcement
  - Disband message edit/cleanup
  - Persistent LFG message loop
- Voice logging
  - Temp voice delete snapshots (history persisted)
  - Manual voice log channels (log-only, no temp settings controls)
  - Manual in-channel Voice Log panel lifecycle:
    - create/update while users are present
    - delete when channel becomes empty
  - Manual leave log containers (non-pinging mention format)
- Stats
  - `/stats me`
  - `/stats user` (admin-only)
  - `/stats leaderboard`
  - Global aggregation includes temp + manual session logs
- Dashboard
  - Guild config management (log/LFG channels, lobbies, roles)
  - Voice Log channels section:
    - Temp channels auto-logged
    - Manual channels add/remove
  - Active temp channels tab
  - Mixed Voice Log tab (Temp Deleted + Manual Voice Session labels)
  - Voice leaderboard with pagination
  - Voice Log page (`/voice-log`) for full history
  - Adaptive polling/backoff and lazy tab loading

## Architecture

- Bot runtime: Node.js + `discord.js`
- Dashboard: Next.js App Router + shadcn/ui
- Database: Postgres (`DATABASE_URL`)

Core paths:
- Bot entry: `src/index.js`
- Config store/data layer: `src/config-store.js`
- LFG modules: `src/bot/lfg/*`
- Stats module: `src/bot/stats.js`
- Dashboard app: `dashboard/src/*`

## Requirements

- Node.js 18+
- Postgres database
- Discord bot with required permissions/intents

## Environment Variables

Root `.env` is used by bot and dashboard.

Required (bot):
- `DISCORD_TOKEN`
- `DATABASE_URL`

Required (dashboard):
- `DATABASE_URL`
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `NEXTAUTH_SECRET`
- `ADMIN_DISCORD_USER_ID`
- `DISCORD_TOKEN` or `DISCORD_BOT_TOKEN` (for Discord API lookups)

Optional/common:
- `LOG_CHANNEL_ID` (fallback log channel)
- `VOICE_CHANNEL_ID` (legacy fallback for single-channel logging)
- `DEBUG=true`

Postgres SSL controls:
- `PG_SSL_MODE` (default: `require`)
- `PG_SSL_REJECT_UNAUTHORIZED` (default: `true`)
- `PG_SSL_CA` or `PG_SSL_CA_BASE64` (optional custom CA)

For providers with self-signed/intermediate chain issues, temporary workaround:
- `PG_SSL_REJECT_UNAUTHORIZED=false`

## Setup

1. Install root deps:
   - `npm install`
2. Create env file:
   - `cp .env.example .env`
   - fill required variables
3. Run bot:
   - `npm start`
4. Run dashboard (dev):
   - `npm --prefix dashboard install`
   - `npm --prefix dashboard run dev`

## Commands

- Bot start: `npm start`
- Deploy checks: `npm run deploy`
- Deploy slash commands: `npm run deploy:commands`
- SQLite -> Postgres migration: `npm run migrate:postgres`
- Verify expected DB indexes: `npm run db:verify-indexes`
- Capture voice query benchmark: `npm run perf:voice-queries`

Dashboard:
- Dev: `npm --prefix dashboard run dev`
- Build: `npm --prefix dashboard run build`

## Discord Intents and Permissions

Gateway intents:
- `Guilds`
- `GuildVoiceStates`

Bot permissions (minimum expected):
- `View Channel`
- `Send Messages`
- `Manage Channels`
- `Move Members`

Depending on your setup, you may also need:
- `Manage Roles` (if using role-related lobby behavior)

## Data and Schema

Primary storage is Postgres.

Schema source:
- `scripts/schema-postgres.sql`

Manual utility docs/artifacts:
- Cleanup/hardening plan: `docs/cleanup-hardening-plan.md`
- Shared DB refactor notes: `docs/shared-db-refactor-candidates.md`
- Performance snapshots: `docs/perf/`

## Notes

- This repository evolves quickly; review recent commits before deploying to production.
- Test in a staging Discord server before applying to a large community server.
