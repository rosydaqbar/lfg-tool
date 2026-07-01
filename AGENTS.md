# Agent Notes

## Repo Shape
- This is not an npm workspace: root, `dashboard/`, and `landing/` each have their own `package.json` and lockfile.
- Root app is the Discord bot. Entrypoint: `src/index.js`; DB/config store: `src/config-store.js`; JTC flow: `src/bot/join-to-create.js`; LFG flow: `src/bot/lfg/*`; stats/voicecheck: `src/bot/stats.js`.
- Spam Catcher runtime is in `src/bot/spam-catcher.js`; dashboard UI is `dashboard/src/components/dashboard/spam-catcher-section.tsx`; config save/notice delivery is `dashboard/src/app/api/guilds/[id]/config/route.ts`.
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
- Spam Catcher data spans `spam_catcher_config`, `spam_catcher_events`, `spam_catcher_notice_messages`, and `spam_catcher_integrity_checks`; keep root store, dashboard DB helpers, and fresh schema aligned.

## Dashboard Behavior Gotchas
- Guild selection is persisted in browser `localStorage` (`lfg-tool:selected-guild-id`) and `/api/guilds` is paginated; avoid reverting to eager loading every manageable guild.
- Settings intentionally lazy-loads channels and roles only when a selector opens; opening Settings should primarily load `/api/guilds/:id/config`.
- Dashboard bot status checks Discord via the dashboard's configured bot token; it does not prove gateway presence of the running bot process.
- Spam Catcher ban delays are stored as minutes. Dashboard UI supports minute choices from 1-60 and hour choices from 2-24; normalization should preserve hour delays up to 1440 minutes.

## Discord Bot Gotchas
- DM role mentions do not render like guild messages; avoid putting role mentions in reminder DM copy or `allowedMentions.roles`.
- Reminder DM cleanup only works for DMs sent after `reminder_dm_message_id` is stored; older DMs cannot be reliably deleted.
- JTC temp-channel cleanup paths are split across voice-state cleanup, watchdog reconciliation, and `/voicecheck` delete; update all relevant paths when adding cleanup side effects.
- Spam Catcher requires `GuildMessages`; timeout actions require `Moderate Members`; ban actions require `Ban Members`.
- Spam Catcher ignores Discord Administrators and leaves caught trap-channel messages in place.
- Spam Catcher explicitly handles users who are already timed out, unavailable in the guild, or already banned; preserve these statuses in review/log flows instead of collapsing them into generic timeout/ban failures.
- Spam Catcher trap-channel notices use Component V2. Webhook delivery must include `with_components=true`; use `wait=true` when sending if the message ID must be persisted.
- Spam Catcher notice counts are caught event rows/IDs, not distinct users. Bot-delivered notices are per trap channel; webhook notices are one message in the webhook's channel.
- Spam Catcher Integrity Checked buttons count one row per `(guild_id, channel_id, user_id)` using `ON CONFLICT DO NOTHING`; do not disable the public button for everyone after one user clicks it.
- Integrity Checked temporarily bypasses webhook delivery and uses bot-delivered notices, but webhook settings should be preserved read-only so turning Integrity Checked off restores the prior webhook setup.
- Dashboard validates webhook URL format before calling Discord, auto-checks each per-trap-channel webhook after typing stops, and config save rejects missing/mismatched webhooks or webhooks whose `guild_id` does not match the selected guild.
- Immediate-ban DM delivery sends the DM before banning; keep this order because DMs after a ban can fail.
