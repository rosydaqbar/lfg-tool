# Cleanup, Hardening, and Performance Plan (No Feature Changes)

## Goal

Improve security posture, runtime efficiency, and code maintainability without changing existing behavior, UX, or feature set.

## Scope and Constraints

- No functional changes.
- Keep API response shapes and Discord message behavior unchanged.
- Keep database schema backward-compatible.
- Ship in small, verifiable batches.

## Key Findings

1. **DB TLS is permissive in production paths**
   - `src/config-store.js`
   - `dashboard/src/lib/db.ts`
   - `scripts/migrate-sqlite-to-postgres.js`
   - Current use of `rejectUnauthorized: false` should be replaced with strict/env-driven TLS.

2. **Voice event hot path does repeated DB work**
   - `src/index.js`
   - Multiple reads/writes and repeated summary builds per `voiceStateUpdate` can become expensive under voice churn.

3. **Stats queries duplicate heavy aggregation logic**
   - `src/config-store.js`
   - Multiple similar CTE chains for aggregate/rank increase DB CPU and latency.

4. **Dashboard polling and endpoint mixing increase load**
   - `dashboard/src/components/dashboard/active-temp-channels-card.tsx`
   - `dashboard/src/components/dashboard/voice-log-deleted-card.tsx`
   - `dashboard/src/components/dashboard/voice-leaderboard-card.tsx`
   - `dashboard/src/app/api/guilds/[id]/voice-delete-logs/route.ts`

5. **Unbounded in-memory caches**
   - `dashboard/src/lib/discord-usernames.ts`
   - `src/bot/log-channel.js`
   - No max-size/eviction strategy risks memory growth over long uptime.

6. **Duplicated DB/business logic across bot and dashboard**
   - `src/config-store.js`
   - `dashboard/src/lib/db.ts`
   - Increases drift risk and maintenance cost.

## Delivery Strategy

### Phase 1 - Security and Environment Hardening

Purpose: remove high-risk defaults and fail fast on invalid runtime config.

- Add centralized env validation for bot and dashboard startup.
- Make DB SSL strict by default.
- Allow local-dev TLS override through explicit env flags only.
- Ensure auth/config required vars are validated (`DATABASE_URL`, Discord keys, admin ID, NextAuth secret).

### Phase 2 - Voice Event Path Optimization

Purpose: reduce DB round-trips and per-event CPU while preserving behavior.

- Add short TTL + in-flight dedupe cache for guild config lookup.
- Reuse computed manual activity summaries within one event cycle.
- Avoid duplicate fetches for channel/message identifiers when already known.
- Keep all current logging and panel update behavior exactly the same.

### Phase 3 - Query and Index Optimization

Purpose: reduce DB CPU and improve latency on stats/log reads.

- Consolidate duplicated CTE logic for stats aggregate/rank into one query path.
- Add targeted indexes for hot lookup patterns (owner lookup, active session lookups, manual session scans).
- Validate `EXPLAIN` plans before/after for top queries.

### Phase 4 - Dashboard Load Optimization

Purpose: reduce unnecessary API and Discord fetch pressure.

- Replace fixed 15s polling with visibility-aware polling + slower background interval.
- Add retry/backoff on API errors to avoid tight-failure loops.
- Split combined voice-log endpoint concerns so leaderboard polling does not trigger full mixed-log work.

### Phase 5 - Maintainability Refactor

Purpose: reduce duplication and simplify safe future changes.

- Extract shared DB/query contracts used in both bot and dashboard.
- Standardize error handling helpers for API routes and Discord operation wrappers.
- Keep module boundaries small and focused (fetch/parse/transform/response responsibilities).

## Implementation TODO Checklist

### A. Security and Config

- [x] Add strict DB SSL config helper for all Postgres clients.
- [x] Remove hardcoded `rejectUnauthorized: false` defaults.
- [x] Add explicit local-dev override docs and env flags.
- [x] Add startup env validation in bot runtime.
- [x] Add startup env validation in dashboard runtime.

### B. Runtime Performance (Bot)

- [x] Add short-lived cache for `getGuildConfig(guildId)` with in-flight promise dedupe.
- [x] Refactor `voiceStateUpdate` flow to reuse computed summaries per event.
- [x] Ensure no behavior changes to manual panel update/delete lifecycle.
- [x] Ensure no behavior changes to temp channel prompt refresh lifecycle.

### C. Query/DB Optimization

- [x] Consolidate duplicated stats query logic for aggregate + rank.
- [x] Add missing indexes for frequently filtered/sorted columns.
- [x] Verify index creation is idempotent in schema/migration scripts.
- [x] Capture before/after query timing for stats and mixed logs.

### D. Dashboard/API Efficiency

- [x] Implement visibility-aware polling in dashboard cards.
- [x] Add backoff on repeated API failures.
- [x] Split leaderboard fetch from mixed-log fetch path.
- [x] Keep existing API output format compatible for current UI.

### E. Cache Hygiene

- [x] Add bounded size + TTL eviction for username cache.
- [x] Add TTL/invalidation strategy for text channel cache.
- [x] Add safe cleanup on failed fetch/edit/delete operations.

### F. Refactor and Consistency

- [x] Identify shared DB logic candidates across bot/dashboard.
- [x] Extract shared utilities without changing behavior.
- [x] Unify error logging style and context tags.

## Acceptance Criteria

- No user-visible behavior changes in Discord bot workflows.
- No dashboard feature regressions.
- Existing commands, routes, and panel updates behave exactly the same.
- Lower DB query count and/or lower p95 latency on key flows.
- No insecure DB TLS defaults in production paths.

## Validation Checklist (Per Phase)

- [x] `node --check src/index.js`
- [x] `node --check src/config-store.js`
- [x] `node --check src/bot/voice-log.js`
- [x] `npm --prefix dashboard run build`
- [ ] Manual smoke test for voice join/move/leave flows
- [ ] Manual smoke test for dashboard tabs and voice-log pages

## Artifacts

- Index verification script: `scripts/verify-db-indexes.js`
- Query benchmark script: `scripts/benchmark-voice-queries.js`
- Latest benchmark snapshot: `docs/perf/voice-query-benchmark-2026-03-03T20-59-37-881Z.md`
- Shared DB candidate notes: `docs/shared-db-refactor-candidates.md`

## Rollout Notes

- Land changes in small commits by phase.
- Deploy after each phase with quick smoke verification.
- If any regression appears, revert only the latest phase commit.
