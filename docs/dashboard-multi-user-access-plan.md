# Dashboard Multi-User Access Plan

## Goal

Allow multiple users to manage the dashboard based on guild access rules, instead of a single owner/admin user ID.

## Access Rules (Approved)

1. User must be signed in.
2. User must be a member of the configured setup guild (`setup.selectedGuildId`).
3. User must have at least one guild role with `Administrator` permission.
4. Owner bypass: if user is the guild owner, access is allowed even without admin role bit.

If any required check fails, block dashboard access and show warning:

`You cannot access this dashboard due to lack access.`

## Implementation Checklist

- [x] Add a new guild-based access guard in `dashboard/src/lib/session.ts`.
- [x] Resolve setup guild and validate signed-in session + Discord OAuth access token.
- [x] Verify membership in setup guild using `GET /users/@me/guilds` (user token).
- [x] Add owner bypass from guild membership payload (`owner: true`).
- [x] Resolve bot token using existing setup/env fallback.
- [x] Fetch guild member roles for current user with bot token.
- [x] Fetch guild roles and evaluate `Administrator` permission bit.
- [x] Return structured access result/reason for API/UI usage.
- [x] Replace dashboard API auth checks from single-user gate to guild-based guard.
- [x] Enforce configured guild ID match on guild-scoped endpoints.
- [x] Show explicit warning message on dashboard page when access denied.
- [ ] Keep setup reset/setup-owner operations unchanged unless explicitly requested.
- [ ] Run build validation (`dashboard`), then smoke test denied/allowed scenarios.

Build validation status: done (`npm run build` in `dashboard`).
Manual denied/allowed smoke scenarios: pending.

## API/Route Targets

- `dashboard/src/app/api/guilds/route.ts`
- `dashboard/src/app/api/guilds/[id]/channels/route.ts`
- `dashboard/src/app/api/guilds/[id]/roles/route.ts`
- `dashboard/src/app/api/guilds/[id]/config/route.ts`
- `dashboard/src/app/api/guilds/[id]/temp-channels/route.ts`
- `dashboard/src/app/api/guilds/[id]/voice-delete-logs/route.ts`
- `dashboard/src/app/api/guilds/[id]/voice-leaderboard/route.ts`

## Notes

- Keep error messages actionable (not generic `Unauthorized`).
- Prefer one centralized authorization function to avoid drift.
- Do not rely on `ownerDiscordId` for dashboard access after this change.
