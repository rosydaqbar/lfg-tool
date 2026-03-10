# Bot Status + 3 Deploy Guides Plan

## Goal

Add a clear, non-technical **Bot Status** section above **Reset settings** in dashboard settings (and setup login page where reset section is reused), with:

- Online/Offline status chip
- Offline recovery guides in **3 tabs**:
  1. Local
  2. Railway
  3. Railway CLI

## UX Requirements

- If bot is **online**: show status only (no deploy steps).
- If bot is **offline**: show friendly guidance and 3-tab deploy helper.
- Content must be beginner-friendly (plain language, clear actions, minimal jargon).
- Include concrete mention of `/.setup-state.json` in Local instructions.
- Railway tab includes deploy button with:
  - `https://railway.com?referralCode=EGh1Pg`
- Railway CLI tab references:
  - `https://docs.railway.com/cli.md`

---

## Implementation Scope

### 1) Bot status API

Create route:

- `dashboard/src/app/api/bot/status/route.ts`

Behavior:

- Read health URL from env:
  - `BOT_HEALTHCHECK_URL` (fallback: `http://127.0.0.1:80`)
- Perform short-timeout fetch to health endpoint.
- Return structured JSON:
  - `online` boolean
  - `healthUrl`
  - `checkedAt`
  - optional `payload` (on success)
  - optional `error` (on failure)
- Always return response safely so UI can render status without crashing.

### 2) Bot status section UI

Update component:

- `dashboard/src/components/dashboard/reset-settings-section.tsx`

Add:

- New card **above** Reset Settings card:
  - Title: `Bot status`
  - Chip:
    - green `Online`
    - red `Offline`
- Health endpoint display line.

State additions:

- Bot status fetch state (loading/result/error)
- Active deploy tab:
  - `"local" | "railway" | "railway-cli"`

### 3) Three-tab offline helper

Render only when `online === false`:

Tabs:
1. Local
2. Railway
3. Railway CLI

Use same visual language as existing settings UI (rounded bordered blocks, clear spacing, command blocks).

## Content Copy Plan (Non-Technical)

### Local tab (must explicitly mention setup-state.json)

1. Check setup file exists
   - `/.setup-state.json` should exist in project root (same level as `package.json`).
2. If file is missing
   - Run setup wizard again and complete bot + database steps.
3. Install dependencies
   - `npm install`
4. Start bot
   - `npm start`
5. Confirm running
   - Look for "Logged in as ..." and check status chip.
6. Optional env fallback
   - You may set env manually (`DISCORD_TOKEN`, `DATABASE_URL`, `NEXTAUTH_SECRET`) if not using `/.setup-state.json`.

### Railway tab (website flow)

1. Open Railway and create project.
2. Connect your GitHub repository.
3. Set required env vars:
   - `DISCORD_TOKEN`
   - `DATABASE_URL`
   - `NEXTAUTH_SECRET`
4. Deploy service.
5. Check logs and health.
6. CTA button:
   - **Deploy on Railway** -> `https://railway.com?referralCode=EGh1Pg`

Note:
- Railway does not automatically read local `/.setup-state.json`.

### Railway CLI tab (terminal flow)

1. Install CLI
   - `npm i -g @railway/cli`
   - (alt: brew/scoop)
2. Login
   - `railway login`
3. Link/init project
   - `railway link` or `railway init`
4. Set env vars
   - `railway variable set DISCORD_TOKEN=...`
   - `railway variable set DATABASE_URL=...`
   - `railway variable set NEXTAUTH_SECRET=...`
5. Deploy
   - `railway up`
6. Verify
   - `railway logs`
7. Docs button:
   - **Railway CLI Docs** -> `https://docs.railway.com/cli.md`

## Integration Notes

- This section appears in both:
  - Dashboard settings page
  - Setup/login page (because reset section is reused)
- Keep existing Reset Settings behavior unchanged.

## Validation Checklist

- Bot status chip updates correctly for online/offline.
- Offline helper shows exactly 3 tabs.
- Local tab clearly references `/.setup-state.json`.
- Railway tab includes referral deploy button.
- Railway CLI tab includes docs-based command flow.
- UI remains readable on mobile and desktop.
- Build passes successfully.
