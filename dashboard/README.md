# Voice Log Dashboard

Admin-only dashboard to manage which voice channels are logged, which channels are Join-to-Create lobbies (with per-lobby role pairing), and where logs/LFG posts are sent.

## Requirements
- Node.js 18+
- A Discord app with OAuth enabled
- A bot token with access to the target guilds

## Setup
1. Install dependencies:
   - `npm install`
2. Configure environment:
   - The dashboard loads the repo root `.env` automatically.
   - Set `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`
   - Set `DISCORD_TOKEN` (bot token used for channel/role discovery)
   - Set `ADMIN_DISCORD_USER_ID`
   - Set `NEXTAUTH_SECRET` and `NEXTAUTH_URL`
   - Set `DATABASE_URL` (Supabase Postgres, use `?sslmode=require`)
3. Start the dashboard:
   - `npm run dev`

## OAuth Redirect URL
For local dev, add this to your Discord app:
- `http://localhost:3000/api/auth/callback/discord`

## Data
The dashboard writes to Postgres via `DATABASE_URL`.

## Notes
- This dashboard is locked to a single guild ID in the UI.
