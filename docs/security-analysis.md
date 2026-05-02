# Security Analysis and Next Steps

Date: 2026-05-02

Scope reviewed:
- Dashboard authentication and authorization
- Setup and credential handling APIs
- Guild dashboard APIs
- Auto-role approval flow from dashboard and Discord bot messages
- Database and Discord API availability risks

## Executive Summary

The dashboard has a reasonable authorization model for normal guild management: most guild APIs call `requireDashboardGuildAccess`, which verifies the signed-in Discord user belongs to the configured guild and has Administrator permission. That is a strong baseline.

The highest-risk issues are around setup/bootstrap behavior and secret handling. Several setup endpoints can store sensitive credentials in plaintext inside setup state, and the unauthenticated Discord app bootstrap endpoint is intentionally available before setup completion. These are acceptable for local first-run development, but risky for any internet-exposed deployment unless tightly controlled.

The second major risk area is state-changing API protection. The API relies on NextAuth session cookies and server-side authorization, but state-changing routes do not currently enforce an explicit CSRF token or origin check. SameSite cookie behavior helps, but explicit CSRF protection is safer for admin actions like reset, config changes, leaderboard mutation, and auto-role approval.

The third risk area is operational availability. Recent errors show database session pool exhaustion. Availability failures can become a security issue because approval/denial flows may become inconsistent, stale Discord messages can remain clickable, and repeated retries can amplify Discord/database rate limits.

## Findings

### High: Secrets Are Mirrored in Plaintext Setup State

Relevant files:
- `dashboard/src/app/api/setup/token/route.ts`
- `dashboard/src/app/api/setup/discord-app/route.ts`
- `dashboard/src/app/api/setup/database/route.ts`
- `dashboard/src/lib/db.ts`
- `dashboard/src/lib/auth.ts`

Observed behavior:
- Bot token is encrypted, but also stored as plaintext via `botToken` in setup state.
- Discord client secret is encrypted, but also stored as plaintext via `discordClientSecret` in setup state.
- Database URL is encrypted, but also stored as plaintext via `databaseUrl` in setup state.
- `.setup-state.json` is intentionally used as a fallback/priority source in local or env-backed setup flows.

Risk:
- If `.setup-state.json`, local filesystem, build artifacts, logs, backups, or a misconfigured deployment leak, the attacker may gain bot token, OAuth client secret, and database credentials.
- A Discord bot token is highly sensitive. With sufficient bot permissions, token compromise can allow role changes, message deletion, guild data reads, and bot impersonation.
- A database URL compromise exposes all bot and dashboard data.

Recommended fix:
- Stop writing plaintext secret fields after validation.
- Keep only encrypted fields in DB/local setup state.
- Prefer runtime environment variables on production for `DISCORD_TOKEN`, `DISCORD_CLIENT_SECRET`, `DATABASE_URL`, `NEXTAUTH_SECRET`, and `SETUP_SECRET`.
- Add a migration or cleanup utility to remove plaintext `botToken`, `discordClientSecret`, and `databaseUrl` from existing setup state.
- Update `.env.example` and setup copy to explicitly warn that `.setup-state.json` must never be committed, uploaded, shared, or included in backups without encryption.

Priority:
- Do this first.

### High: Unauthenticated Bootstrap Endpoint Can Set Discord OAuth Credentials Before Setup Completion

Relevant file:
- `dashboard/src/app/api/setup/bootstrap-discord-app/route.ts`

Observed behavior:
- `POST /api/setup/bootstrap-discord-app` allows setting Discord client ID and client secret while setup is incomplete without requiring an authenticated setup session.
- `DELETE /api/setup/bootstrap-discord-app` also allows clearing those values while setup is incomplete without authentication.

Risk:
- If the dashboard is reachable on the internet before setup is complete, an attacker can race to set OAuth credentials.
- This can interfere with legitimate setup or redirect sign-in through attacker-controlled Discord application settings.
- This is especially risky on public Vercel deployments where first-run setup endpoints are exposed.

Recommended fix:
- Protect bootstrap with a one-time setup key, e.g. `SETUP_BOOTSTRAP_TOKEN`, required in a header like `x-setup-token`.
- Alternatively, restrict bootstrap to local development only unless `ALLOW_PUBLIC_BOOTSTRAP=true` is explicitly set.
- Disable bootstrap immediately after owner claim, not only after full setup completion.
- Log bootstrap use with timestamp and remote metadata where available.

Priority:
- Do this immediately after plaintext secret cleanup.

### High: Reset Endpoint Allows Setup Reset Without Admin Session If Setup Is Incomplete

Relevant file:
- `dashboard/src/app/api/setup/reset/route.ts`

Observed behavior:
- If setup is incomplete, the endpoint does not require an admin session.
- It still requires current guild ID confirmation.

Risk:
- If an attacker knows or guesses the selected guild ID during incomplete setup, they can reset setup draft state.
- This can be used as a denial-of-service against setup completion.

Recommended fix:
- Require either an admin session, owner setup session, or setup bootstrap token for all reset operations.
- Keep guild ID confirmation, but do not treat it as authentication.

Priority:
- High.

### High: State-Changing Dashboard APIs Lack Explicit CSRF Protection

Relevant files:
- `dashboard/src/app/api/guilds/[id]/config/route.ts`
- `dashboard/src/app/api/guilds/[id]/temp-channels/route.ts`
- `dashboard/src/app/api/guilds/[id]/voice-leaderboard/route.ts`
- `dashboard/src/app/api/guilds/[id]/auto-role-requests/route.ts`
- `dashboard/src/app/api/setup/*/route.ts`

Observed behavior:
- State-changing API calls use session cookies and server-side authorization.
- There is no explicit CSRF token validation or Origin/Referer enforcement in the reviewed routes.

Risk:
- If browser cookie SameSite settings are weakened, misconfigured, or bypassed in some context, a malicious page could attempt to trigger admin actions from an authenticated browser.
- High-impact actions include reset setup, approving/denying role requests, deleting leaderboard rows, deleting temp channel records, and changing bot config.

Recommended fix:
- Add a shared guard for non-GET routes:
  - Reject requests whose `Origin` is not the configured dashboard origin.
  - Require a CSRF token header for mutating requests.
  - Keep JSON content-type checks for body-bearing mutation routes.
- Add this guard to all `POST`, `PUT`, `PATCH`, and `DELETE` handlers.

Priority:
- High.

### Medium-High: Auto-Role Approval Has Partial Transactionality Across Discord and DB

Relevant files:
- `dashboard/src/app/api/guilds/[id]/auto-role-requests/route.ts`
- `src/bot/auto-role.js`

Observed behavior:
- Dashboard approval gives the Discord role first, then updates DB status.
- If Discord role assignment succeeds but the DB update fails, the role is granted while the request may remain pending.
- Recent bot-side stale-click cleanup mitigates double-processing after DB status changes, but it cannot detect the case where Discord succeeded and DB failed.

Risk:
- A request can remain pending even after the user received the role.
- Another admin may later click approve/deny from Discord or dashboard and see confusing results.
- Audit trail can become incorrect.

Recommended fix:
- Before approving, check whether the member already has the target role. If yes, mark the request `approved` without calling role add again.
- Add a reconciliation step after Discord role assignment failure/success:
  - If DB update fails after role add, log loudly and return an error that instructs admin to retry/reconcile.
  - On retry, member-has-role check should allow DB status repair.
- Consider adding `processing` status with a short timeout if multiple admins may act simultaneously.
- Add an audit table for approval attempts with `request_id`, `actor_id`, `action`, `discord_result`, `db_result`, and timestamp.

Priority:
- Medium-high.

### Medium-High: Dashboard Session Authorization Cache Can Preserve Access Briefly After Permission Removal

Relevant file:
- `dashboard/src/lib/session.ts`

Observed behavior:
- Successful guild access checks are cached for 60 seconds.

Risk:
- If an admin role is removed from a user, they may retain dashboard access for up to 60 seconds.
- This is usually acceptable, but it matters for sensitive operations.

Recommended fix:
- Keep cache for read routes, but force fresh authorization for high-risk mutations such as setup reset, auto-role approval, leaderboard debug edits, and config changes.
- Alternatively reduce success cache TTL to 15-30 seconds.

Priority:
- Medium-high if multiple admins are expected.

### Medium: Setup Session Allows First Signed-In User to Claim Owner If Owner Is Not Set

Relevant files:
- `dashboard/src/lib/setup-session.ts`
- `dashboard/src/app/api/setup/state/route.ts`

Observed behavior:
- `requireSetupSession` allows any signed-in user if `ownerDiscordId` is not already set.
- Claim owner action then sets the owner to the current user.

Risk:
- During first-run setup on a public deployment, the first user to authenticate can claim ownership.

Recommended fix:
- Require `ADMIN_DISCORD_USER_ID` or a setup bootstrap token before owner claim on internet-exposed deployments.
- If `ADMIN_DISCORD_USER_ID` is configured, only that Discord user should be able to claim owner.
- Display a prominent warning when setup is incomplete and no owner allowlist is configured.

Priority:
- Medium.

### Medium: Bot Status Endpoint Is Public

Relevant file:
- `dashboard/src/app/api/bot/status/route.ts`

Observed behavior:
- `GET /api/bot/status` does not require authentication.
- It returns bot identity, selected guild ID, and whether the bot is in the guild.

Risk:
- Leaks operational metadata to unauthenticated visitors.
- Can be polled to infer deployment health and selected guild configuration.

Recommended fix:
- Require setup/admin session for full details.
- If a public health endpoint is needed, return only generic status without bot identity or guild ID.

Priority:
- Medium.

### Medium: Setup Database Validation Can Be Used for Internal Network Probing

Relevant file:
- `dashboard/src/app/api/setup/database/route.ts`

Observed behavior:
- Authenticated setup users can submit arbitrary Postgres URLs for validation.
- The server attempts to connect and returns connection failure details.

Risk:
- If setup access is compromised or owner is unclaimed, this can be used as a limited SSRF/internal network probe.
- Error messages can reveal network reachability or database server behavior.

Recommended fix:
- Restrict database validation after owner claim to owner/admin only.
- Redact raw connection error details in production.
- Optionally block private IP ranges unless local development mode is explicitly enabled.
- Set a low connection timeout and pool max of 1 for validation pools.

Priority:
- Medium.

### Medium: Database Connection Exhaustion Can Cause Security-Relevant Inconsistency

Relevant files:
- `dashboard/src/lib/db.ts`
- `dashboard/src/app/api/guilds/[id]/dashboard-summary/route.ts`

Observed behavior:
- A recent error showed Supabase session-mode pool exhaustion.
- Dashboard pool is now globally reused and capped, and summary DB calls were made sequential.

Remaining risk:
- Several helper paths still create scoped pools when using setup database URL fallback.
- Multiple dashboard instances or Vercel serverless concurrency can still exceed small session pool limits.

Recommended fix:
- Prefer Supabase transaction pooler for dashboard and bot.
- Set `POSTGRES_POOL_MAX=1` for dashboard on session-mode poolers.
- Avoid creating new scoped pools per helper call where possible; centralize setup DB fallback pool reuse.
- Move `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE` calls out of hot request paths into setup/migration steps.

Priority:
- Medium.

### Medium: Debug/Mutation Actions Lack Fine-Grained Authorization

Relevant files:
- `dashboard/src/app/api/guilds/[id]/voice-leaderboard/route.ts`
- `dashboard/src/app/api/guilds/[id]/temp-channels/route.ts`
- `dashboard/src/app/api/guilds/[id]/auto-role-requests/route.ts`

Observed behavior:
- Any dashboard-authorized guild admin can edit/delete leaderboard entries, delete temp channel records, and approve/deny auto-role requests.

Risk:
- Discord Administrator is broad. Some admins may not be intended to mutate bot records or debug leaderboard data.

Recommended fix:
- Add optional `DASHBOARD_OWNER_ONLY_MUTATIONS=true` or role allowlist configuration.
- Require owner-only access for debug actions like leaderboard edit/delete and setup reset.
- Keep regular config edits available to guild admins if desired.

Priority:
- Medium.

### Low-Medium: Error Responses May Leak Operational Detail

Relevant files:
- `dashboard/src/app/api/setup/database/route.ts`
- Several API routes returning external API messages

Observed behavior:
- Database validation returns raw error details.
- Discord action routes may return Discord API messages.

Risk:
- Helps legitimate debugging, but can leak provider details, network behavior, permission state, or internal configuration.

Recommended fix:
- In production, return generic errors to clients and log details server-side.
- Keep detailed errors only in development.

Priority:
- Low-medium.

## What To Do Next

### Immediate Actions

1. Remove plaintext secrets from setup state writes.
2. Add a cleanup migration/script to remove existing plaintext secrets from DB and `.setup-state.json`.
3. Protect `bootstrap-discord-app` with a one-time setup token or disable it outside local development.
4. Require authenticated owner/admin/setup token for setup reset even before setup completion.
5. Add shared CSRF/Origin validation for all mutation routes.

### Short-Term Hardening

1. Add owner-only or allowlisted access for destructive/debug actions.
2. Add member-has-role reconciliation before dashboard auto-role approval.
3. Add audit logging for dashboard mutations:
   - config save
   - setup reset
   - leaderboard edit/delete
   - temp channel delete
   - auto-role approve/deny
4. Make `/api/bot/status` authenticated or reduce public response data.
5. Redact production error details for database and Discord API failures.

### Availability And Rate-Limit Hardening

1. Set `POSTGRES_POOL_MAX=1` if using Supabase session-mode pooler.
2. Prefer Supabase transaction pooler URL for serverless/dashboard workloads.
3. Reuse setup fallback pools instead of creating scoped pools repeatedly.
4. Move schema changes out of hot request paths.
5. Keep dashboard overview on the DB-only summary endpoint, with Discord lookups limited and cached.

### Longer-Term Improvements

1. Add a formal permission model:
   - owner
   - dashboard admin
   - viewer
   - debug operator
2. Add a mutation audit table and dashboard audit page.
3. Add automated security tests for unauthorized access, CSRF rejection, setup ownership, and mutation permissions.
4. Add dependency and secret scanning to CI.
5. Add a deployment checklist for Vercel/Supabase/Discord OAuth settings.

## Suggested Implementation Order

1. Secret cleanup and plaintext write removal.
2. Setup bootstrap and reset protection.
3. CSRF/Origin guard for mutation APIs.
4. Owner-only controls for destructive/debug actions.
5. Auto-role approval reconciliation and audit log.
6. Public status endpoint lockdown.
7. Connection-pool and migration cleanup.

## Notes

- The existing guild authorization gate is a strong base. Do not remove it.
- The main security gap is not normal dashboard read access; it is first-run setup exposure, plaintext secret persistence, and mutation hardening.
- Rate-limit and connection-pool failures should be treated as security-relevant because they can leave approval workflows partially completed or stale.
