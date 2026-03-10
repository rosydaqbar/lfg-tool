# Discord LFG Voice Bot + Dashboard

> [!IMPORTANT]
> This project is provided under CC0. Please review code, validate permissions, and test in a safe server before production use.

Join-to-Create Discord voice bot with LFG flow, voice-session logging, global stats, and a Next.js dashboard with setup wizard and guild-scoped management.

## What It Does Now

- Discord bot features
  - Join-to-Create lobbies (create per-user temp channels, auto-delete when empty)
  - Temp voice panel controls (rename, lock, transfer owner, claim, region, size)
  - LFG modal + post flow from temp channels
  - Persistent LFG message refresh loop
  - Manual voice channel logging (in-channel panel + leave session logs)
  - Voice stats commands (`/stats me`, `/stats user`, `/stats leaderboard`)
  - In-panel buttons for `My Stats` and `Leaderboard`
- Dashboard features
  - First-run setup wizard (`/setup`) with resumable state
  - Setup stores runtime state in root `.setup-state.json`
  - Guild config management (log channel, optional LFG channel)
  - Join-to-Create lobby management
  - Voice Log channel settings (manual channel include/exclude)
  - Active Temp Channels tab
  - Voice Log history (`/voice-log`) and paginated leaderboard
  - Bot status card checked via Discord API (token + selected guild membership)
  - Role-based dashboard access (guild owner or Administrator role)

## Data Safety Notes

- `Reset settings` is now non-destructive for database rows.
  - It resets setup state only.
  - It does not delete guild records/tables.
- Setup save paths were hardened to avoid accidental config wiping.
  - Existing guild voice settings are preserved when setup channels are updated.

## Screenshots

Store all screenshots under root `screenshots/`.

Example structure:

- `screenshots/bot-join-to-create-prompt.png`
- `screenshots/bot-voice-settings-panel.png`
- `screenshots/bot-lfg-modal.png`
- `screenshots/bot-lfg-post.png`
- `screenshots/bot-manual-voice-log-panel.png`
- `screenshots/bot-stats-leaderboard.png`
- `screenshots/dashboard-settings.png`
- `screenshots/dashboard-jtc-lobbies.png`
- `screenshots/dashboard-voice-log-channels.png`
- `screenshots/dashboard-voice-log-page.png`

## Project Structure

- Bot runtime
  - Entry: `src/index.js`
  - Data layer: `src/config-store.js`
  - LFG modules: `src/bot/lfg/*`
  - Stats module: `src/bot/stats.js`
  - Health server: `src/bot/health-server.js`
- Dashboard (Next.js App Router)
  - App/API: `dashboard/src/app/*`
  - Components: `dashboard/src/components/*`
  - Dashboard DB/runtime helpers: `dashboard/src/lib/*`
- Landing page (separate app)
  - `landing/*`
- Scripts
  - Command deploy: `scripts/deploy-commands.js`
  - SQLite -> Postgres migration: `scripts/migrate-sqlite-to-postgres.js`
  - Schema/index/perf helpers: `scripts/*`

## Runtime and Storage Model

- Bot + dashboard share setup/runtime state from root `.setup-state.json`.
- Database source priority in dashboard data access is:
  1. `DATABASE_URL` env
  2. setup-state database URL
  3. SQLite fallback
- Supported setup DB providers:
  - `supabase`
  - `local_postgres`
  - `local_sqlite`

## Requirements

- Node.js 18+
- Discord bot token + app credentials
- Database (Postgres recommended; SQLite supported)

## Environment Variables

Root `.env` is used by the bot and also by dashboard runtime.

Common required values:

- `DISCORD_TOKEN`
- `DATABASE_URL` (recommended for direct runtime)
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `NEXTAUTH_SECRET`

Common optional values:

- `DISCORD_BOT_TOKEN` (dashboard fallback if `DISCORD_TOKEN` not set)
- `NEXTAUTH_URL` (e.g. `http://localhost:3000`)
- `ADMIN_DISCORD_USER_ID` (optional; owner fallback from setup is supported)
- `SQLITE_PATH` (default `./data/discord.db`)
- `LOG_CHANNEL_ID` (legacy fallback)
- `VOICE_CHANNEL_ID` (legacy fallback)
- `DEBUG=true`

Postgres SSL controls:

- `PG_SSL_MODE` (default `require`)
- `PG_SSL_REJECT_UNAUTHORIZED` (default `true`)
- `PG_SSL_CA` or `PG_SSL_CA_BASE64` (optional CA)

## Quick Start

1. Install root dependencies:
   - `npm install`
2. Create env file:
   - `cp .env.example .env`
3. Start bot:
   - `npm start`
4. Run dashboard in another terminal:
   - `npm --prefix dashboard install`
   - `npm --prefix dashboard run dev`
5. Open dashboard and finish setup wizard:
   - `http://localhost:3000/setup`

## Commands

Root commands:

- Start bot: `npm start`
- Deploy checks: `npm run deploy`
- Deploy slash commands: `npm run deploy:commands`
- SQLite -> Postgres migration: `npm run migrate:postgres`
- Verify DB indexes: `npm run db:verify-indexes`
- Benchmark voice queries: `npm run perf:voice-queries`

Dashboard commands:

- Dev: `npm --prefix dashboard run dev`
- Build: `npm --prefix dashboard run build`
- Start: `npm --prefix dashboard run start`

Landing commands:

- Dev: `npm run landing:dev`
- Build: `npm run landing:build`
- Start: `npm run landing:start`

## Discord Intents and Permissions

Gateway intents:

- `Guilds`
- `GuildVoiceStates`

Minimum bot permissions:

- `View Channel`
- `Send Messages`
- `Manage Channels`
- `Move Members`

Optional depending on setup:

- `Manage Roles`

## Notes

- Dashboard bot status now verifies via Discord API, so remote-hosted bot setups are supported.
- Keep `.setup-state.json` private; it contains sensitive setup/runtime secrets.
- This repository evolves quickly; review recent commits before production deployment.

## License

This project is dedicated to the public domain under CC0 1.0 Universal.
See `LICENSE`.
