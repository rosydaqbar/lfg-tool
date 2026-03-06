# Setup Wizard Plan (Dashboard + Discord Bot)

## Goal

Provide a first-run setup flow that helps admins configure bot access, guild targeting, database connection, and required channels before entering the full dashboard.

## Scope

- Add onboarding wizard for first-time setup.
- Keep existing bot/dashboard features unchanged.
- Support setup using a separate environment profile.
- Store setup progress safely and resumably.

## High-Level Flow

0. Discord app credentials (`Client ID` + `Client Secret`) to enable OAuth
1. Discord login
2. Admin ownership/claim (first setup owner)
3. Bot token input + validation
4. Guild ID setup (select/input + validation)
5. Bot invite check (skip if already in guild)
6. Database setup (Local Postgres or Supabase)
7. Channel setup (`Log Channel`, `LFG Channel`)
8. Finalize setup and enter dashboard

## Why This Order

- Bot token must be valid before checking invite status or reading guild resources.
- Database must be connected before persisting guild/channel config.
- Channel setup should happen only after guild + bot access is confirmed.

## Step-by-Step Detail

### Step 1 - Discord Login

- Reuse current NextAuth flow.
- If user is not authenticated, redirect to sign-in.

### Step 2 - Admin Claim

- If setup is not initialized, first authenticated user can claim setup owner.
- Store owner Discord ID in setup state.
- If already initialized, only owner/admin can continue.

### Step 3 - Bot Token Setup

- Hidden input (`password` style).
- Save encrypted token (never plaintext in logs/response).
- Validate token with Discord API endpoint (e.g. `/users/@me` with Bot auth).
- Block next step until valid.

### Step 4 - Guild ID Setup

- Allow input or selection from accessible guild list.
- Validate guild exists and user has permission.
- Save selected guild ID.

### Step 5 - Invite Bot (Skippable)

- Build bot OAuth invite URL using client ID + required permissions.
- Check whether bot is already in selected guild.
- If already present: show "already invited" and allow continue.
- If not: show invite CTA and allow retry check.

### Step 6 - Database Setup

Options:

- Local Postgres
  - Provide local setup instructions and connection string template.
- Supabase
  - Provide step guide to create project and copy connection string.

Common actions:

- Connection URL input form.
- Test connection action.
- Apply/check schema action.
- Continue only if DB test succeeds.

### Step 7 - Channel Setup

- Fetch guild channels using bot token.
- Require `Log Channel`.
- `LFG Channel` optional (fallback supported).
- Save baseline guild config.

### Step 8 - Finalize

- Mark setup complete.
- Redirect to main dashboard.
- Show success summary + quick links.

## Architecture and Files (Planned)

### UI

- `dashboard/src/app/setup/page.tsx`
- `dashboard/src/components/setup/*`

### API

- `dashboard/src/app/api/setup/state/route.ts`
- `dashboard/src/app/api/setup/token/route.ts`
- `dashboard/src/app/api/setup/guild/route.ts`
- `dashboard/src/app/api/setup/invite/route.ts`
- `dashboard/src/app/api/setup/database/route.ts`
- `dashboard/src/app/api/setup/channels/route.ts`
- `dashboard/src/app/api/setup/complete/route.ts`

### Data

- Add setup state table (e.g. `setup_state`).
- Add encrypted secret storage for bot token (or separate secrets table).

## Security Requirements

- Enforce authenticated admin session for all setup endpoints.
- Encrypt bot token at rest.
- Never return raw token after save.
- Redact sensitive values in logs.
- Add CSRF-safe request handling on mutating routes.

## Environment Strategy

- Use root `.env` only (no separate setup flag required).
- In setup lifecycle, require only baseline dashboard env values.
- Resolve admin access from setup owner when `ADMIN_DISCORD_USER_ID` is not set.

## Compatibility Notes

- Keep database target as Postgres.
- "Local database" in UI means local Postgres (not SQLite).
- Preserve existing APIs/config contracts where possible.

## Acceptance Criteria

- Admin can complete setup from zero to ready state.
- Setup can be resumed after interruption.
- Bot invite step correctly detects already-in-guild state.
- Database test must pass before continuing.
- Dashboard opens with saved baseline config and all other settings empty/default.

## Implementation Checklist

- [ ] Add setup state schema + migration/ensure logic
- [ ] Build setup page and step UI components
- [ ] Implement setup API routes
- [ ] Implement bot token encryption + secure storage
- [ ] Add guild/invite validation logic
- [ ] Add DB connection test and schema check actions
- [ ] Add channel selection/save baseline config
- [ ] Add finalize gate + redirect into dashboard
- [ ] Add setup-mode runtime guard behavior
- [ ] Add docs for setup mode and environment profiles

## Risks and Mitigations

- Token leakage risk -> strict redaction + encrypted storage.
- Misconfigured DB URL -> hard validation + explicit error messages.
- Partial setup state -> resumable state machine with step status.
- Invite permission mismatch -> clear required permissions in invite helper.

## Out of Scope (for initial release)

- Multi-tenant setup for multiple unrelated admins.
- Full in-app secret manager replacement.
- SQLite runtime support.
