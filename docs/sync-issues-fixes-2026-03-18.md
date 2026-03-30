# Sync Issues Fixes Addendum (March 18, 2026)

## Why this addendum
This document extends the previous report (`docs/sync-issues-fixes-2026-03-13.md`) with the large-sale hardening and final validations added after additional production-like tests.

## Problems we wanted to prevent
- Large sales timing out in `record_sale` RPC.
- A very large cart creating oversized payloads that are slow to queue/sync.
- False positive "already applied" verification when transaction header exists but item rows are incomplete.
- Duplicate sale submission from double tap/click while sync is busy.

## Fixes implemented

### 1) Large-sale path hardening in sale sync
File: `src/lib/saleSync.ts`

- Added payload and count thresholds to detect very large sales.
- Added helper functions:
  - `estimateSalePayloadSizeBytes(payload)`
  - `getRecommendedRecordSaleTimeoutMsFromCounts(itemCount, productCount)`
  - `getRecommendedRecordSaleTimeoutMs(payload)`
- Added RPC bypass for very large sales:
  - If payload is too large, skip `record_sale` RPC and use legacy table sync path.
- Improved legacy sync performance/safety:
  - `transaction_items` insert is chunked (instead of one huge insert).

### 2) Adaptive timeout + stronger apply verification
File: `src/lib/syncManager.ts`

- `record_sale` timeout is now adaptive based on sale size (items/products), not a fixed timeout.
- `verifyOperationApplied` now validates item count for `record_sale`:
  - A transaction row alone is no longer enough.
  - If remote `transaction_items` count is lower than expected, operation is treated as not fully applied.
- Added/kept safe fallback helper for missing DB function handling used in product sale stock decrement flow.

### 3) Safer queue behavior for large sale payloads
File: `src/store/transactionStore.ts`

- Sale payload size is estimated before queueing.
- Very large payloads bypass queue write and go direct sync immediately.
- Queue-write failures (for example storage quota pressure) also fall back to direct sync.
- Direct sync uses adaptive timeout and dead-letter fallback if it still fails.

### 4) Sales UI protections against duplicate/oversized submits
File: `src/pages/Sales.tsx`

- Added submit lock (`isSubmittingSale` + ref lock) to prevent duplicate sale submissions.
- Kept normal sale flow unchanged for regular carts.
- Added UI warning alert when cart is large.
- Added confirmation only for extremely large carts (edge case safeguard).
- Complete sale button now shows loading and is disabled while processing.

## Behavior for unregistered product sales and no-client sales
- Unregistered cart lines (`UPS 0`) continue to sync as transaction items with `productId: ""`.
- No-client sale remains valid when there is no pending balance:
  - customer defaults to walk-in.
- If there is pending balance, selecting a client is still required before sale submit.

## Expected logs after these fixes
Normal and expected in dev:
- periodic connectivity checks every ~30s
- foreground sync flush attempt logs
- "queue is empty" skip logs when nothing is pending
- occasional Chrome `[Violation]` warnings under heavy UI events

Unexpected and should be investigated:
- repeated timeouts with growing queue
- dead-letter count increasing repeatedly
- pending count never draining while online

## Validation checklist for final review
1. Add products, sell, add products again (queue should drain).
2. Sell with unregistered products (`UPS 0`) and confirm transaction appears in Transactions and export.
3. Sell without client and no pending balance (should pass as walk-in).
4. Sell with pending balance and no client (should block until client selected).
5. Create a large cart and complete sale:
   - confirm dialog appears
   - submit button locks/loads
   - no duplicate transactions from repeated click/tap
6. Run `dumpSyncState()` and confirm:
   - `isSyncing: false`
   - `pendingCount: 0`
   - `deadLetterCount: 0`

## Current status
Based on the latest local verification/build, the code now includes protections for large-sale sync, duplicate submit prevention, and stronger operation verification, while preserving existing sales rules for unregistered items and walk-in customers.
