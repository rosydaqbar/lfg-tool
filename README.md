# Discord Voice Join Logger

Logs when users join a voice channel and posts the `userId` and `voiceChannelId` to a text channel.

## Setup
1. Install dependencies:
   - `npm install`
2. Configure environment:
   - `cp .env.example .env`
   - Fill in `DISCORD_TOKEN` in `.env` (used by bot and dashboard)
   - Optional: set `LOG_CHANNEL_ID` as a fallback log channel
   - Optional: set `VOICE_CHANNEL_ID` to only log a specific voice channel
   - Optional: set `DEBUG=true` to print voice event diagnostics
   - Optional: set `DATABASE_PATH` if you want a custom SQLite location (relative to repo root)
   - Optional: set `CONFIG_CACHE_TTL_MS` to control config refresh
3. Start the bot:
   - `npm start`

## Required Intents and Permissions
- Gateway intents: `Guilds`, `GuildVoiceStates`
- Bot permissions in the log channel: `View Channel`, `Send Messages`

## Notes
- The bot only logs joins (not moves or leaves).
- If the dashboard sets a watchlist, only those channels are logged.
- If no watchlist exists, `VOICE_CHANNEL_ID` is honored as a fallback.
- `DEBUG=true` will log voice state transitions to help troubleshoot.
- Optional file logging can be added under `logs/` if you want to persist events.
- Join-to-Create lobbies can be configured in the dashboard; the bot will create temporary voice channels and move users.

## Dashboard (Next.js + shadcn/ui)
The dashboard lives in `dashboard` and controls logging configuration stored in SQLite.
It is currently locked to guild ID `670147766839803924` in the UI.

- LFG Channel (optional) controls where the LFG post is sent; if unset it falls back to the Log Channel.

1. Install dependencies:
   - `cd dashboard`
   - `npm install`
2. Configure environment:
   - The dashboard will load the repo root `.env` automatically.
   - Set `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` in the root `.env`
   - Ensure `DISCORD_TOKEN` is set for channel discovery
   - Set `NEXTAUTH_SECRET` and `NEXTAUTH_URL`
   - Set `ADMIN_DISCORD_USER_ID` (defaults to your admin ID)
3. Start the dashboard:
   - `npm run dev`

The shared database is stored at `data/discord.db` by default.
