# Agent Notes

## Repo Shape
- This is not an npm workspace: root, `dashboard/`, and `landing/` each have their own `package.json` and lockfile.
- Root app is the Discord bot. Entrypoint: `src/index.js`; DB/config store: `src/config-store.js`; JTC flow: `src/bot/join-to-create.js`; LFG flow: `src/bot/lfg/*`; stats/voicecheck: `src/bot/stats.js`.
- Dashboard is a Next.js app under `dashboard/`. App/API routes live in `dashboard/src/app/*`; shared dashboard DB/env logic is in `dashboard/src/lib/*`.
- Landing page is a separate Next.js app under `landing/`; root npm scripts proxy to it as `landing:*`.

## Commands
- Bot runtime: `npm start`.
- Deploy Discord commands: `npm run deploy:commands`.
- Root DB/perf helpers: `npm run migrate:postgres`, `npm run db:verify-indexes`, `npm run perf:voice-queries`.
- Dashboard: `npm --prefix dashboard run dev`, `npm --prefix dashboard run build`, `npm --prefix dashboard run lint`, `npm --prefix dashboard run start`.
- Landing: `npm run landing:dev`, `npm run landing:build`, `npm run landing:start`.
- There is no root test/lint script; use focused checks such as `node --check src/path/file.js` for bot JS changes.

## Verification
- For dashboard changes, run `npm --prefix dashboard run build`; it performs Next compile/type checks and is the most reliable verification currently present.
- For landing changes, run `npm run landing:build`.
- For bot-only JS changes, run `node --check` on every edited JS file; add dashboard build too if schemas or shared setup docs/scripts changed.
- `dashboard` has an ESLint script (`npm --prefix dashboard run lint`), but root bot code has no configured lint command.

## Env And Setup
- Root `.env` is used by both bot and dashboard; `dashboard/src/lib/env.ts` also loads `dashboard/.env*`, root `.env*`, and `.setup-state.json`.
- Bot startup calls `src/bot/runtime-config.js` before validation; it can hydrate `DISCORD_TOKEN`, `DATABASE_URL`, and owner ID from `.setup-state.json` using `SETUP_SECRET` or `NEXTAUTH_SECRET`.
- Required bot runtime vars after hydration are `DISCORD_TOKEN` and `DATABASE_URL`; missing values cause `src/bot/env.js` to exit.
- Cloud/dashboard env setup uses `SETUP_COMPLETE=true`, `OWNER_DISCORD_ID`, `SELECTED_GUILD_ID`, Discord OAuth vars, bot token, `DATABASE_URL`, `NEXTAUTH_URL`, and `NEXTAUTH_SECRET`.
- Supabase should use the Transaction Pooler URL on port `6543` with `sslmode=require`; keep pool envs low (`BOT_POSTGRES_POOL_MAX=2`, `POSTGRES_POOL_MAX=1` is documented).

## Database And Schema
- `src/config-store.js` auto-adds several bot-needed columns with `ALTER TABLE IF EXISTS ... ADD COLUMN IF NOT EXISTS`; fresh schema is in `scripts/schema-postgres.sql`.
- When adding DB fields used by both bot and dashboard, update all relevant places: `src/config-store.js`, `scripts/schema-postgres.sql`, and `dashboard/src/lib/db.ts`.
- Existing deployments may not have old data for newly tracked message IDs; cleanup code should tolerate missing/null IDs.

## Dashboard Behavior Gotchas
- Guild selection is persisted in browser `localStorage` (`lfg-tool:selected-guild-id`) and `/api/guilds` is paginated; avoid reverting to eager loading every manageable guild.
- Settings intentionally lazy-loads channels and roles only when a selector opens; opening Settings should primarily load `/api/guilds/:id/config`.
- Dashboard bot status checks Discord via the dashboard's configured bot token; it does not prove gateway presence of the running bot process.

## Discord Bot Gotchas
- DM role mentions do not render like guild messages; avoid putting role mentions in reminder DM copy or `allowedMentions.roles`.
- Reminder DM cleanup only works for DMs sent after `reminder_dm_message_id` is stored; older DMs cannot be reliably deleted.
- JTC temp-channel cleanup paths are split across voice-state cleanup, watchdog reconciliation, and `/voicecheck` delete; update all relevant paths when adding cleanup side effects.
