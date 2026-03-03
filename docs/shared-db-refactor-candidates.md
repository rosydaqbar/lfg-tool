# Shared DB Refactor Candidates

## Goal

Reduce duplicated query/schema logic between bot and dashboard while keeping existing behavior unchanged.

## Candidate 1: Postgres Bootstrap

- **Current duplication**
  - `src/config-store.js`
  - `dashboard/src/lib/db.ts`
  - `scripts/migrate-sqlite-to-postgres.js`
- **Shared utility target**
  - Pool creation
  - SSL config selection
  - Common query wrapper and errors

## Candidate 2: Guild Config Read/Write Contract

- **Current duplication**
  - `src/config-store.js` (`getGuildConfig`)
  - `dashboard/src/lib/db.ts` (`getGuildConfig`, `saveGuildConfig`)
- **Shared utility target**
  - SQL statements
  - payload normalization
  - lfg-enabled compatibility behavior

## Candidate 3: Voice Log/Leaderboard Aggregation

- **Current duplication**
  - `src/config-store.js` stats/leaderboard CTE patterns
  - `dashboard/src/lib/db.ts` mixed logs + leaderboard CTE patterns
- **Shared utility target**
  - common CTE fragments for temp/manual session union
  - leaderboard aggregation builder

## Candidate 4: Schema Ensure Helpers

- **Current duplication**
  - table/index create-ensure blocks across bot/dashboard
- **Shared utility target**
  - idempotent ensure routines with tagged logging
  - single source for schema evolution checks

## Candidate 5: Row-to-Domain Mapping Helpers

- **Current duplication**
  - repeated row mapping and number/date coercion
- **Shared utility target**
  - typed mappers for channel logs, leaderboard rows, activity rows

## Rollout Pattern (No Feature Changes)

1. Extract helpers behind existing function signatures.
2. Keep exported APIs unchanged.
3. Move one area at a time with build/syntax checks.
4. Compare route outputs before/after for compatibility.
