# Discord LFG Voice Bot + Dashboard

> [!IMPORTANT]
> I vibe-coded this project and shipped it fast. This project is provided under CC0. Please review code, validate permissions, and test in a safe server before production use.

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

## Recent Changelog

- Temp channel controls and checks
  - Added `/voicecheck` with Administrator-only access.
  - Added in-command cleanup action for temp channels in `Not found` or `Empty` state.
  - Dashboard `Active Temp Channels` now validates channel existence from live Discord state (not DB only), including `Exists`/`Empty`/`Not found` status.
- Voice owner/admin behavior
  - Added setup-owner/admin override support for owner-gated voice actions.
  - Added explicit override notice text when admin override is used.
- Join-to-Create prompt reliability
  - Persisted Join-to-Create prompt message ID to DB so updates edit the same message.
  - Tightened prompt message targeting to the correct channel panel (avoid editing unrelated `jtc_*` messages).
  - Added refresh retries after voice state changes to reduce race-condition stale panels.
- Voice Log data correctness
  - `Voice Log` panel refresh now validates active users against live Discord voice membership before render.
  - Added stale/missing activity row repair for temp voice activity during refresh.
  - Applied the same live-membership real-check and stale-row cleanup to manual Voice Log channel panels.
- Logging and keepalive improvements
  - Added dedupe/lock safeguards to reduce duplicate "Temp Voice Channel Deleted" and "Manual Voice Session Leave" logs.
  - Updated keepalive workflow to request root URL (`/`) and print response body in GitHub Actions logs.
  - Health server now detects and logs keepalive pings (with forwarded client IP) for easier Koyeb verification.

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
  - Schema/index/perf helpers: `scripts/*`

## Runtime and Storage Model

- There are two supported setup modes:
  - Local dashboard setup: use `/setup`; the dashboard writes root `.setup-state.json` and/or DB `setup_state`.
  - Hosted/env setup: skip `/setup`; provide the equivalent setup values as environment variables, useful for Vercel/serverless where local setup files are not persistent.
- Setup source priority is:
  1. `.setup-state.json` from dashboard setup, when present
  2. DB `setup_state`, when configured
  3. Env-backed setup, only when `SETUP_COMPLETE=true`
- Owner identity follows the same model:
  - Dashboard setup stores `ownerDiscordId`.
  - Env-backed setup uses `OWNER_DISCORD_ID` as the equivalent fallback.
  - Owner is the configured user only. Admin means any other user in the configured guild with Discord Administrator permission.
- Database source priority in dashboard data access is:
  1. `DATABASE_URL` env
  2. setup-state database URL
- Supported setup DB providers:
  - `supabase`

## Requirements

- Node.js 18+
- Discord bot token + app credentials
- Supabase Postgres database

## Dashboard Setup Paths

Choose one setup path based on where the dashboard runs.

### Option A: Local/VPS Dashboard Setup

Use this when the dashboard runs on your machine or VPS and can persist files/state.

State source:
- `/setup` writes the setup state.
- `.setup-state.json` is the highest-priority setup source when present.
- The owner is claimed in the setup wizard and saved as `ownerDiscordId`.

Required local/VPS env before opening setup:
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`

These two values are only for dashboard login/session runtime. They are not bot, guild, owner, channel, or database setup values.

The setup wizard collects:
- Discord OAuth client ID/secret
- Discord bot token
- owner Discord user ID through owner claim
- selected guild ID
- log/LFG channels
- Supabase database URL

Steps:
1. Install dependencies:
   - `npm install`
   - `npm --prefix dashboard install`
2. Create a minimal env file for dashboard auth runtime:
   - `cp .env.example .env`
3. Set only these local/VPS auth values:
   - `NEXTAUTH_URL=http://localhost:3000` for local development
   - `NEXTAUTH_URL=https://your-vps-dashboard-domain.com` for VPS hosting
   - `NEXTAUTH_SECRET=replace_with_a_long_random_string`
4. Run dashboard:
   - local: `npm --prefix dashboard run dev`
   - VPS production: `npm --prefix dashboard run build` then `npm --prefix dashboard run start`
5. Open setup:
   - local: `http://localhost:3000/setup`
   - VPS: `https://your-vps-dashboard-domain.com/setup`
6. Complete setup in the browser.
7. Start or restart the bot after setup is complete:
   - `npm start`

Use this path when you want the dashboard setup UI to own configuration.

### Option B: Cloud Env Setup (Vercel/Serverless)

Use this when the dashboard runs somewhere like Vercel and you do not want to rely on dashboard setup state files.

State source:
- Do not deploy `.setup-state.json`.
- Set env vars directly.
- `SETUP_COMPLETE=true` tells the dashboard to treat env vars as completed setup.
- `OWNER_DISCORD_ID` mirrors setup-state `ownerDiscordId`.

Required cloud env:
- `SETUP_COMPLETE=true`
- `OWNER_DISCORD_ID`
- `SELECTED_GUILD_ID`
- `LOG_CHANNEL_ID`
- `DISCORD_TOKEN`
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`

Optional cloud env:
- `LFG_CHANNEL_ID`
- `DISCORD_BOT_TOKEN` as fallback if `DISCORD_TOKEN` is not set
- `POSTGRES_POOL_MAX=1` for Supabase session-mode pooler
- `DEBUG=true`

Postgres/Supabase SSL env:
- `PG_SSL_MODE=require`
- `PG_SSL_REJECT_UNAUTHORIZED=false` when using Supabase pooler with `sslmode=require`
- `PG_SSL_CA` or `PG_SSL_CA_BASE64` only when using CA verification

Steps:
1. Create the Discord application and bot manually.
2. Invite the bot to the target guild with required permissions.
3. Create Supabase Postgres and use the Transaction Pooler URL on port `6543` with `sslmode=require`.
4. Set all required cloud env vars in the hosting provider.
5. Deploy the dashboard.
6. Sign in with Discord.

Expected access behavior:
- The user whose ID equals `OWNER_DISCORD_ID` is shown as `Owner` and can reset setup.
- Other users with Discord Administrator permission in `SELECTED_GUILD_ID` are shown as `Admin` and can manage dashboard settings.
- Users without Administrator permission in the configured guild are denied.

## Environment Variables

Root `.env` is used by the bot and also by dashboard runtime.

Use the Local/VPS section above if you are using `/setup`.
Use the Cloud Env section above if you are deploying to Vercel/serverless.

## Commands

Root commands:

- Start bot: `npm start`
- Deploy checks: `npm run deploy`
- Deploy slash commands: `npm run deploy:commands`
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
