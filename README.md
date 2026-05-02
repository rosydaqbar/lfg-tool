# Discord LFG Voice Bot + Dashboard

> [!IMPORTANT]
> I vibe-coded this project and shipped it fast. This project is provided under CC0. Please review code, validate permissions, and test in a safe server before production use.

Join-to-Create Discord voice bot with LFG flow, voice-session logging, global stats, and a Next.js dashboard with setup wizard and guild-scoped management.

In plain terms: users join a lobby voice channel, the bot creates a private temporary voice room for them, and the dashboard lets server admins manage settings without editing files by hand.

## Table of Contents

- [What It Does Now](#what-it-does-now)
- [Data Safety Notes](#data-safety-notes)
- [Recent Changelog](#recent-changelog)
- [Screenshots](#screenshots)
- [Project Structure](#project-structure)
- [How Setup Is Saved](#how-setup-is-saved)
- [Requirements](#requirements)
- [Dashboard Setup Options](#dashboard-setup-options)
  - [Option A: Local/VPS Dashboard Setup](#option-a-localvps-dashboard-setup)
  - [Option B: Cloud Env Setup (Vercel/Serverless)](#option-b-cloud-env-setup-vercelserverless)
- [Environment Variables You May Need](#environment-variables-you-may-need)
- [Commands](#commands)
- [Discord Permissions Needed](#discord-permissions-needed)
- [Notes](#notes)
- [License](#license)

## What It Does Now

- Discord bot features
  - Join a lobby voice channel to create your own temporary voice channel.
  - Temporary channels are deleted automatically when empty.
  - Channel owners can rename, lock, transfer, claim, change region, and set user limits from a Discord panel.
  - Players can post LFG messages from their temporary voice channel.
  - The bot keeps an LFG message up to date so users can quickly find open voice rooms.
  - Voice time is logged for selected voice channels.
  - Users can check voice stats with `/stats me`, `/stats user`, and `/stats leaderboard`.
  - Voice panels include quick buttons for `My Stats` and `Leaderboard`.
- Web dashboard features
  - First-time setup page at `/setup`.
  - Setup can be paused and continued later.
  - Manage the Discord server settings, log channel, and optional LFG channel.
  - Add or remove Join-to-Create lobby channels.
  - Choose which normal voice channels should track voice time.
  - View currently active temporary voice channels.
  - View voice log history and leaderboard pages.
  - Check whether the bot token works and whether the bot is in the selected Discord server.
  - Only the configured owner or Discord users with Administrator permission can use the dashboard.

## Data Safety Notes

- `Reset settings` only resets the setup flow.
  - It does not delete the saved Discord server settings from the database.
- Updating setup channels should not wipe existing voice settings.
- Do not share `.setup-state.json`, `.env`, bot tokens, database URLs, or Discord client secrets.

## Recent Changelog

- Temp channel controls and checks
  - Added `/voicecheck` for Discord Administrators.
  - Added cleanup for temporary channels that are missing or empty.
  - Dashboard `Active Temp Channels` now checks live Discord state, so it can show `Exists`, `Empty`, or `Not found`.
- Voice owner/admin behavior
  - The setup owner and Discord Administrators can help manage owner-only voice actions.
  - The bot now shows a clear notice when an admin override is used.
- Join-to-Create prompt reliability
  - The bot remembers the Join-to-Create prompt message, so updates edit the right message.
  - Prompt updates now target the correct channel panel.
  - Added retries after voice changes to reduce stale panels.
- Voice Log data correctness
  - Voice panels now check who is actually in voice before showing active users.
  - Added cleanup for stale voice tracking records.
  - Manual voice log panels use the same live Discord checks.
- Logging and keepalive improvements
  - Reduced duplicate delete and leave logs.
  - Keepalive checks now hit `/` and print the response for easier troubleshooting.
  - Health logs now show keepalive pings for easier Koyeb checks.

## Screenshots

Put screenshots in the root `screenshots/` folder.

Example files:

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

This is where the main parts of the project live.

- Bot code
  - Main start file: `src/index.js`
  - Database and saved settings: `src/config-store.js`
  - LFG feature files: `src/bot/lfg/*`
  - Voice stats: `src/bot/stats.js`
  - Health check server: `src/bot/health-server.js`
- Dashboard code
  - Pages and API routes: `dashboard/src/app/*`
  - UI components: `dashboard/src/components/*`
  - Dashboard helpers: `dashboard/src/lib/*`
- Landing page code
  - `landing/*`
- Scripts
  - Deploy Discord slash commands: `scripts/deploy-commands.js`
  - Database and performance helper scripts: `scripts/*`

## How Setup Is Saved

- There are two ways to set up the dashboard:
  - Local/VPS setup: open `/setup` in the dashboard and fill in the setup form.
  - Cloud setup: set the values as environment variables instead of using `/setup`. This is best for Vercel or other platforms where files do not stay saved between deploys.
- The app reads setup information in this order:
  1. `.setup-state.json`, if dashboard setup created it
  2. `setup_state` table in the database, if available
  3. Environment variables, only when `SETUP_COMPLETE=true`
- Dashboard access works like this:
  - The owner is the Discord user saved during setup as `ownerDiscordId`.
  - For cloud setup, the owner is set with `OWNER_DISCORD_ID`.
  - Other Discord users can access the dashboard only if they have Administrator permission in the selected server.
- The dashboard finds the database connection in this order:
  1. `DATABASE_URL` env
  2. Database URL saved during setup
- Supported database provider:
  - `supabase`

## Requirements

- Node.js 18+
- Discord bot token
- Discord app client ID and client secret
- Supabase Postgres database URL

## Dashboard Setup Options

Choose one setup path based on where you host the dashboard.

### Option A: Local/VPS Dashboard Setup

Use this when the dashboard runs on your own computer or VPS and can save setup files.

How setup is saved:
- `/setup` saves your setup information.
- `.setup-state.json` is used first when it exists.
- The owner is selected during setup and saved as `ownerDiscordId`.

Required local/VPS values before opening `/setup`:

```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=replace_with_a_long_random_string
```

These two values are only for dashboard login. You will enter the bot token, Discord server ID, owner ID, channel IDs, and database URL later in the setup page.

The setup page asks for:
- Discord OAuth client ID and secret
- Discord bot token
- owner Discord user ID
- selected Discord server ID
- log and LFG channels
- Supabase database URL

Steps:
1. Install dependencies:
   ```bash
   npm install
   npm --prefix dashboard install
   ```
2. Create a small env file for dashboard login:
   ```bash
   cp .env.example .env
   ```
3. Set only these local/VPS login values:
   ```env
   # Local development
   NEXTAUTH_URL=http://localhost:3000

   # VPS hosting
   # NEXTAUTH_URL=https://your-vps-dashboard-domain.com

   NEXTAUTH_SECRET=replace_with_a_long_random_string
   ```
4. Run dashboard:
   ```bash
   # Local development
   npm --prefix dashboard run dev

   # VPS production
   npm --prefix dashboard run build
   npm --prefix dashboard run start
   ```
5. Open setup:
   ```text
   http://localhost:3000/setup
   https://your-vps-dashboard-domain.com/setup
   ```
6. Finish setup in the browser.
7. Start or restart the bot after setup is complete:
   ```bash
   npm start
   ```

Use this path when you want the dashboard setup page to save the configuration for you.

### Option B: Cloud Env Setup (Vercel/Serverless)

Use this when the dashboard runs on Vercel or another cloud host where local files are not reliable.

How setup is saved:
- Do not deploy `.setup-state.json`.
- Put the setup values directly into your hosting provider environment variable settings.
- `SETUP_COMPLETE=true` tells the dashboard that setup is already finished.
- `OWNER_DISCORD_ID` is the env version of setup owner `ownerDiscordId`.

Required cloud env:

```env
SETUP_COMPLETE=true
OWNER_DISCORD_ID=your_discord_user_id
SELECTED_GUILD_ID=your_discord_server_id
LOG_CHANNEL_ID=your_log_text_channel_id
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_application_client_id
DISCORD_CLIENT_SECRET=your_discord_application_client_secret
DATABASE_URL=postgresql://postgres.project-ref:password@aws-region.pooler.supabase.com:6543/postgres?sslmode=require
NEXTAUTH_URL=https://your-dashboard.vercel.app
NEXTAUTH_SECRET=replace_with_a_long_random_string
```

Optional cloud env:

```env
LFG_CHANNEL_ID=your_lfg_text_channel_id
DISCORD_BOT_TOKEN=your_discord_bot_token
BOT_POSTGRES_POOL_MAX=2
POSTGRES_POOL_MAX=1
DEBUG=true
```

Use `DISCORD_BOT_TOKEN` only if `DISCORD_TOKEN` is not set. Use `BOT_POSTGRES_POOL_MAX=2` for the bot and `POSTGRES_POOL_MAX=1` for the dashboard when using the Supabase session-mode pooler. This helps avoid too many database connections.

Postgres/Supabase SSL env:

```env
PG_SSL_MODE=require
PG_SSL_REJECT_UNAUTHORIZED=false
# PG_SSL_CA=...
# PG_SSL_CA_BASE64=...
```

Use `PG_SSL_CA` or `PG_SSL_CA_BASE64` only if your database provider gives you a CA certificate and asks you to verify it.

Steps:
1. Create the Discord application and bot in the Discord Developer Portal.
2. Invite the bot to your Discord server with the required permissions.
3. Create a Supabase Postgres database and use the Transaction Pooler URL on port `6543` with `sslmode=require`.
4. Add all required cloud env vars in your hosting provider.
5. Deploy the dashboard.
6. Sign in with Discord.

Who can access the dashboard:
- The user whose Discord ID equals `OWNER_DISCORD_ID` is shown as `Owner` and can reset setup.
- Other users with Discord Administrator permission in `SELECTED_GUILD_ID` are shown as `Admin` and can manage settings.
- Users without Administrator permission in that Discord server cannot access the dashboard.

## Environment Variables You May Need

Root `.env` is used by both the bot and the dashboard.

Use the Local/VPS section if you are setting up through `/setup`.
Use the Cloud Env section if you are deploying to Vercel or another cloud host.

## Commands

Root commands:

```bash
npm start
npm run deploy
npm run deploy:commands
npm run db:verify-indexes
npm run perf:voice-queries
```

Dashboard commands:

```bash
npm --prefix dashboard run dev
npm --prefix dashboard run build
npm --prefix dashboard run start
```

Landing commands:

```bash
npm run landing:dev
npm run landing:build
npm run landing:start
```

## Discord Permissions Needed

Enable these Discord bot intents in the Discord Developer Portal:

- `Guilds`
- `GuildVoiceStates`

Give the bot these permissions when inviting it to your server:

- `View Channel`
- `Send Messages`
- `Manage Channels`
- `Move Members`

Optional, depending on your setup:

- `Manage Roles`

## Notes

- Dashboard bot status checks Discord directly, so it works even when the bot is hosted somewhere else.
- Keep `.setup-state.json` private. It can contain sensitive values like tokens and database URLs.
- This repository changes quickly. Review recent commits before using it in production.

## License

This project is dedicated to the public domain under CC0 1.0 Universal.
See `LICENSE`.
