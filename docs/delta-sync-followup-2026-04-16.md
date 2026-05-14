# Delta Sync Follow-up (April 16, 2026)

## Why this follow-up exists
This note records the second pass after the initial delta-resync implementation. A separate model review raised a few valid concerns around mobile behavior, empty-state cursors, overlap windows, and index rollout safety. This document captures:

- what was already implemented
- what was hardened on April 16
- what is intentionally still pending
- what another reviewer should double-check next

## Delta sync baseline already implemented
The app now uses this shape:

1. Startup/login:
   - flush pending queue
   - full snapshot load for products, customers, transactions
2. Active app:
   - Supabase realtime updates patch local state directly
3. Foreground/reconnect:
   - flush pending queue
   - delta catch-up for products
   - delta catch-up for customers
   - full reload for transactions

This keeps previous sales logic intact while reducing heavy product/customer reloads on mobile resume.

## Follow-up fixes applied on April 16

### 1) Mobile connectivity probe timeout increased
File: `src/lib/connectionStatus.ts`

- Increased Supabase probe timeout from `5000ms` to `10000ms`.
- Reason: low/mid Android devices and PWAs are more likely to have throttled timers, slower wake-up, or delayed sockets after idle. The old timeout could mark the app disconnected too aggressively.

### 2) Empty full snapshots no longer seed cursors from client wall clock
File: `src/lib/syncMetadata.ts`

- Before:
  - if `getAll()` returned no rows, `lastUpdatedAt` was seeded from `new Date().toISOString()`
- After:
  - if there are no row timestamps, `lastUpdatedAt` stays `null`
- Reason:
  - avoids skipping future DB writes when the client clock is ahead of the server clock
  - next foreground delta falls back to full snapshot safely instead of starting from an unsafe local timestamp

### 3) Delta overlap window widened
File: `src/lib/syncMetadata.ts`

- Increased overlap window from `2s` to `30s`.
- Reason:
  - reduces the chance of missing rows when commit visibility lags behind `updated_at`
  - gives more tolerance for mobile clock skew and slower/bulk write transactions

### 4) Customer delta fetch now has timeout protection
File: `src/services/customerService.ts`

- Added `AbortController` timeout behavior to `customerService.getChangesSince(...)`.
- This now matches the product delta fetch behavior more closely.
- Reason:
  - avoids a hung customer delta request blocking the whole foreground catch-up cycle

### 5) Transient delta errors no longer immediately wipe cursors
Files:
- `src/lib/deltaSync.ts`
- `src/store/productStore.ts`
- `src/store/customerStore.ts`

- Added `shouldResetDeltaCursorAfterError(error)`.
- Cursor is now cleared only for likely contract/schema/query-shape problems.
- For transient failures such as timeout/network hiccups, the cursor is kept and retried later.
- Reason:
  - avoids turning one temporary mobile/network failure into a full-table reload on the next foreground event

### 5.1) Auth/JWT delta failures are now treated as transient
File: `src/lib/deltaSync.ts`

- Narrowed cursor-reset classification so auth-style `PGRST3xx` / `401` / `403` responses do not clear the cursor.
- Reason:
  - expired or refreshing sessions are a recoverable condition, not a schema mismatch

### 6) Realtime delete handlers now remove by id
Files:
- `src/store/productStore.ts`
- `src/store/customerStore.ts`

- `handleRealtimeDelete` now removes the row whenever the payload contains an `id`.
- Reason:
  - protects against hard-delete realtime events where `is_deleted` is not present in the delete payload

### 7) Cursor storage version bumped
File: `src/lib/syncMetadata.ts`

- Storage version updated so previously stored cursors reset cleanly after the new empty-seed and overlap behavior.

### 8) Store-level in-flight guards added
Files:
- `src/store/productStore.ts`
- `src/store/customerStore.ts`

- Full and delta reloads now share per-store in-flight guards.
- If multiple foreground/reconnect triggers fire together, later calls await the current load instead of starting a second overlapping fetch.
- Product full reload requests are queued so a stronger `forceReplace` reload still runs after an in-flight delta/full load completes.

### 9) Realtime cursor advance now happens only after the remote write is applied locally
Files:
- `src/store/productStore.ts`
- `src/store/customerStore.ts`

- `advanceSyncCursor(...)` was moved after the winning merge/delete branch.
- Reason:
  - avoids pushing the cursor forward for realtime payloads that lost the LWW comparison and were not applied

### 10) Delta pagination got a circuit breaker
Files:
- `src/services/productService.ts`
- `src/services/customerService.ts`

- Added a maximum batch-count guard so a paging bug cannot spin forever.

### 11) Full snapshots no longer regress the cursor
File: `src/lib/syncMetadata.ts`

- `seedSyncCursorFromTimestamps(...)` now preserves the newer of:
  - the current stored cursor
  - the max timestamp from the newly fetched active rows
- Reason:
  - avoids a full snapshot pushing `lastUpdatedAt` backward after realtime already advanced it (especially after soft deletes)

### 12) Stale full-snapshot backstop added
Files:
- `src/lib/syncMetadata.ts`
- `src/store/productStore.ts`
- `src/store/customerStore.ts`

- Delta catch-up now falls back to a full snapshot when the last full snapshot is older than 24 hours.
- Reason:
  - gives the app a cheap recovery path for any rare class of missed write that overlap windows alone cannot catch

### 13) Delta LWW policy aligned with realtime
Files:
- `src/store/productStore.ts`
- `src/store/customerStore.ts`

- Delta merge now only overwrites when the remote row is strictly newer (`>`), matching realtime behavior.
- Reason:
  - avoids equal-timestamp delta replays clobbering optimistic local state

## What was intentionally not changed

### Transactions still use full reload on foreground
- We did not move transactions to delta sync.
- Reason:
  - current DB shape does not expose a clean `transactions.updated_at` path in the same way as products/customers

### Sales / QR sales / queue semantics were not changed
- No business-rule changes were made to:
  - sale submission
  - QR sales
  - pending retry
  - dead-letter retry
- Reason:
  - current sales flow is working and this pass was focused on data refresh behavior only

## Supabase migration status
File: `scripts/manual-delta-sync-indexes.sql`

Important:
- This manual SQL file has **not** been applied to the live project yet.
- A review correctly flagged that index creation on a busy table should be rolled out carefully.
- To remove the `supabase db push` footgun, the index SQL was moved out of `supabase/migrations/`.
- The live rollout path is now:
  - manual `CREATE INDEX CONCURRENTLY`
  - outside a transaction
  - during a quiet rollout window
  - from a direct Postgres client (`psql`, DBeaver, TablePlus, pgAdmin), not from a transaction-wrapped SQL runner

This means the app code can be reviewed independently, and the DB rollout can be scheduled separately without accidental write-blocking from a normal migration push.

## Build status
- `npm run build` passed after the April 16 follow-up fixes.

## Reviewer guidance for the next model
The next reviewer should focus on:

1. Is `30s` overlap enough, or should it be larger?
2. Is the 24-hour full-snapshot backstop the right threshold, or should it be shorter/longer?
3. Is the cursor-reset heuristic in `deltaSync.ts` correctly scoped after excluding auth-style failures and forcing batch-limit fallback?
4. What is the cleanest production rollout strategy for the index creation step?
5. Are there any remaining correctness risks without touching the sales flow?

## My current opinion
- The delta-sync direction is still correct.
- The April 16 follow-up plus this hardening pass materially reduce the biggest correctness/performance risks raised by review.
- The main remaining open item before live DB rollout is still the index rollout strategy and whether we want to use `lastFullSnapshotAt` as a future stale-data backstop.
