# Multi-Guild Functionality Plan

## Product Direction

The dashboard should work like an organization-style control panel. A user signs in once, then manages one Discord server at a time. To view another server's setup, logs, stats, or settings, the user switches guilds from the dashboard.

The dashboard must not show or merge all guild data into one global view. Every dashboard view should be scoped to the currently selected guild.

## Decisions

- `OWNER_DISCORD_ID` is only relevant to the first app/dashboard setup and bot setup.
- App owner does not automatically manage every guild where the bot is installed.
- Guild dashboard access is admin-only per Discord guild.
- No read-only access for non-admin users.
- Multi-guild becomes the main model. Single-guild env setup is not kept as a long-term mode.
- Guild switching happens inside the dashboard, not by manually changing env vars.

## Access Model

A signed-in user can open a guild dashboard only when all of these are true:

1. The user signed in with Discord OAuth.
2. The user's Discord guild list includes the selected guild.
3. The user is the guild owner or has Discord Administrator permission in that guild.
4. The bot is installed in that guild for management actions.

The app owner can reset or manage app-level setup, but guild management still depends on Discord permissions for that guild.

## Setup Model

Setup should split into two layers.

### App Setup

App setup is global and only needs to happen once per deployment.

It includes:

- Discord OAuth client ID and secret.
- Discord bot token.
- Supabase database URL.
- Dashboard owner claim.
- `NEXTAUTH_URL` and `NEXTAUTH_SECRET`.

After app setup is complete, the dashboard can load guilds from Discord OAuth and let admins onboard each guild separately.

### Guild Setup

Guild setup happens one guild at a time after sign-in.

It includes:

- Checking if the bot is installed in the selected guild.
- Inviting the bot if missing.
- Choosing log channel.
- Choosing optional LFG channel.
- Configuring Join-to-Create lobbies.
- Configuring Voice Log channels.
- Configuring Auto Role rules.

If a guild is not configured yet, opening it should show a guild setup/onboarding state instead of the full dashboard.

## Dashboard UX

The dashboard should start with a guild switcher.

Guild list states:

- `Ready`: bot is installed and guild config exists.
- `Needs setup`: bot is installed, but required guild config is missing.
- `Invite bot`: user can manage the guild, but the bot is not installed.
- `No access`: should generally be hidden, because non-admin guilds should not be shown as manageable.

When a user selects a guild:

- Dashboard header shows the current guild name and access label.
- All tabs and cards load only that guild's data.
- Logs, leaderboard, temp channels, auto-role requests, and settings are guild-scoped.
- Switching guilds reloads the current dashboard context for the new guild.

Recommended first implementation can keep one main dashboard route and store the selected guild in client state or query string. Route-based guild pages can come later if needed.

## Discord API Usage

OAuth scopes:

```text
identify guilds
```

Use signed-in user token:

```text
GET /users/@me/guilds
```

This returns the guilds the user is in. Each guild includes enough permission data to filter for guild owner or Administrator access.

Use bot token:

```text
GET /guilds/{guild.id}
GET /guilds/{guild.id}/channels
GET /guilds/{guild.id}/roles
GET /guilds/{guild.id}/members/{user.id}
```

Bot-token checks confirm bot installation, channels, roles, and live guild access.

Cache guild access checks briefly to avoid Discord rate limits.

## Environment Changes

Keep global env values:

```env
DISCORD_CLIENT_ID=your_discord_application_client_id
DISCORD_CLIENT_SECRET=your_discord_application_client_secret
DISCORD_TOKEN=your_discord_bot_token
DATABASE_URL=postgresql://postgres.project-ref:password@aws-region.pooler.supabase.com:6543/postgres?sslmode=require
NEXTAUTH_URL=https://your-dashboard-domain.com
NEXTAUTH_SECRET=replace_with_a_long_random_string
OWNER_DISCORD_ID=your_discord_user_id
SETUP_COMPLETE=true
BOT_POSTGRES_POOL_MAX=2
POSTGRES_POOL_MAX=1
```

Remove these as required setup values:

```env
SELECTED_GUILD_ID=
LOG_CHANNEL_ID=
LFG_CHANNEL_ID=
```

Those values can be treated as migration/bootstrap fallbacks only during transition, then removed from documentation once multi-guild is stable.

## Database Changes

Most existing feature tables already include `guild_id`, so the main problem is setup state.

### Current Problem

`setup_state` is currently a singleton and contains `selected_guild_id`, `log_channel_id`, and `lfg_channel_id`. That makes the dashboard think there is one configured guild.

### Target Shape

Global app setup should only store app-wide secrets and owner setup state.

Guild-specific settings should live in guild-scoped tables.

Recommended app setup table:

```text
app_setup_state
- id = 1
- owner_discord_id
- setup_complete
- discord_client_id
- discord_client_secret_encrypted
- bot_token_encrypted
- database_provider
- database_url_encrypted
- created_at
- updated_at
```

Keep guild settings in:

```text
guild_config
- guild_id
- log_channel_id
- lfg_channel_id
- updated_at
```

Optional metadata table:

```text
dashboard_guilds
- guild_id
- name
- icon
- bot_installed_at
- onboarded_at
- created_by_user_id
- updated_at
```

Do not add manual dashboard access overrides in the first version. Discord guild owner/Administrator permission is the source of truth.

## Bot Impact

The bot should already be close to multi-guild because most runtime behavior uses `guildId`.

Required checks:

- No feature should depend on one global `SELECTED_GUILD_ID`.
- Interactions should use `interaction.guildId`.
- Startup loops should iterate `client.guilds.cache.values()`.
- If a guild has no config, the bot should skip that guild cleanly.
- Env channel fallbacks such as `LOG_CHANNEL_ID` should be removed or treated as temporary migration support.

## API Impact

Existing route shape is good:

```text
/api/guilds/[id]/config
/api/guilds/[id]/channels
/api/guilds/[id]/roles
/api/guilds/[id]/dashboard-summary
/api/guilds/[id]/temp-channels
/api/guilds/[id]/voice-delete-logs
/api/guilds/[id]/voice-leaderboard
/api/guilds/[id]/auto-role-requests
```

Main required change:

```text
requireDashboardGuildAccess(requestedGuildId)
```

This should validate the requested guild directly instead of comparing against a single setup-selected guild.

`GET /api/guilds` should return manageable guilds for the signed-in user, with setup status for each guild.

## Implementation Phases

### Phase 1: Access and Guild Discovery

- Add helper to fetch signed-in user's Discord guilds.
- Filter to guild owner or Administrator guilds.
- Add bot-installation check per guild.
- Add setup-status check per guild from `guild_config`.
- Update `/api/guilds` to return the guild switcher list.
- Refactor `requireDashboardGuildAccess(guildId)` to validate the requested guild.

### Phase 2: Guild Switcher Dashboard

- Add guild switcher to dashboard header.
- Store selected guild in client state or URL query.
- Load all dashboard cards based on selected guild.
- Show `Needs setup` or `Invite bot` state when a guild is not ready.

### Phase 3: Guild Onboarding

- Build guild onboarding state inside dashboard.
- Invite bot when missing.
- Select log/LFG channels when bot is installed.
- Save guild config into `guild_config`.
- Mark guild as ready when required config exists.

### Phase 4: App Setup Cleanup

- Remove selected guild from app setup flow.
- Keep app setup focused on OAuth, bot token, database, and owner claim.
- Add migration from old `setup_state.selected_guild_id` into `guild_config`.
- Keep temporary compatibility reads only where needed during transition.

### Phase 5: Docs and Validation

- Update README for multi-guild setup.
- Update env examples.
- Test with at least two Discord servers.
- Verify guild switching does not leak data between guilds.
- Verify non-admin users cannot access any guild dashboard.

## Testing Checklist

- Owner completes app setup.
- Admin signs in and sees only guilds they can manage.
- Guild with bot installed and config saved opens dashboard normally.
- Guild with bot installed but no config shows setup state.
- Guild without bot installed shows invite action.
- Switching guilds changes all dashboard data.
- Voice logs and leaderboard stay scoped to selected guild.
- Non-admin user is denied.
- App owner without guild admin permission cannot manage that guild.
- Bot skips guilds with missing config without crashing.
