# Sync Issues Fixes (March 13, 2026)

## Context
The app showed repeated sync failures after creating a sale, then later writes (like adding products) also got stuck.

Main visible symptoms:
- Top-right status stayed in `Sincronizando...`
- No visible network calls in DevTools for some stuck operations
- Console showed repeated timeout errors (for example `Sync operation timed out after 30000ms`)
- Foreground reload logs appeared repeatedly, but queue was not clearing

## Root Causes
1. Queue head blocking:
   - A failed `record_sale` operation could sit at the front of the queue and block all later operations.
2. Timeout behavior:
   - Timeout cases were not progressing in a way that guaranteed the queue would move forward.
3. Connectivity timing:
   - Sync checks could rely on stale connection state after background/foreground transitions.
4. Limited observability:
   - It was hard to see exactly where sync was stalling (enqueue, connection check, RPC, retry, or removal).

## Fixes Applied

### 1) Sync manager reliability fixes
File: `src/lib/syncManager.ts`

- Added robust timeout and retry tracing around each operation.
- Added explicit connection probe before sync execution.
- Ensured sync status initializes from real queue/dead-letter counts.
- Improved timeout handling flow to avoid infinite stalled loops.
- Added structured debug logs for:
  - enqueue
  - skip reasons
  - operation execution
  - timeout verification
  - retry/dead-letter transitions
  - lock acquire/release

### 2) Head-of-line blocking protection for sales
Files:
- `src/lib/syncManager.ts`
- `src/lib/syncQueue.ts`

- Added `syncQueue.moveToBack(id)` utility.
- If a `record_sale` operation times out and there are more operations queued, it can be moved to queue tail after retry increment.
- This prevents one flaky sale sync from blocking product/customer updates behind it.

### 3) Sale sync observability improvements
Files:
- `src/store/transactionStore.ts`
- `src/lib/saleSync.ts`

- Added detailed logs for sale sync lifecycle:
  - queueing `record_sale`
  - direct fallback path
  - RPC start/success/error
  - fallback to legacy per-table sync
  - per-product sale stock updates

### 4) Product and connection diagnostics
Files:
- `src/store/productStore.ts`
- `src/lib/connectionStatus.ts`
- `src/components/common/SyncInitializer.tsx`
- `src/utils/syncDiagnostics.ts`

- Added logs for product add/update/delete local writes and queue operation IDs.
- Added connection probe logs (`online/offline`, force checks, status transitions).
- Added startup/foreground sync status snapshots.
- Added `dumpSyncState()` helper to inspect:
  - connection status
  - sync status
  - queue info
  - queue item summary

### 5) Read timeout safety
File: `src/services/productService.ts`

- Added per-batch abort timeout for `getAll()` to fail fast when reads hang.

## Validation Evidence
User validation sequence:
1. Added 2 products
2. Sold 1 product
3. Added 1 more product
4. No sync issues observed

`dumpSyncState()` result (March 13, 2026):
- `isOnline: true`
- `isSupabaseConnected: true`
- `isSyncing: false`
- `pendingCount: 0`
- `deadLetterCount: 0`
- queue `count: 0`
- queue items: `[]`

This indicates a healthy, drained queue and stable sync state.

## Current Status
Sync is stable under the reproduced flow that previously failed.

## Recommended Next Step
After a short observation window, keep `dumpSyncState()` but reduce noisy debug logs if everything remains stable.
