# Sync Architecture — Multi-User Timing Reference

## Overview

The system uses an **optimistic local-first** approach:

1. A sale (or any write) updates the in-memory store and queues the operation to `localStorage` — **instantly visible to the current user**.
2. `syncManager` flushes the queue to Supabase in the background.
3. Supabase emits a `postgres_changes` realtime event to all connected clients.
4. Realtime handlers merge the changed row directly into the matching local store. Foreground recovery later runs delta catch-up for products/customers and a full transaction reload.

---

## How Long Until Other Users See a Change?

| Scenario | Wait time |
|---|---|
| Best case — immediate flush + realtime delivery | Usually under 2 seconds |
| Fallback — waits for periodic queue flush | Up to ~15 seconds plus network latency |
| App was backgrounded | Connectivity check (bounded to 10 seconds), flush, then catch-up |

The fallback flush interval in `syncManager.ts` is **15 seconds**. New operations normally request
an immediate flush. Foreground events first await a fresh connectivity result, then flush and catch up.

---

## Step-by-step Timing Breakdown

```
User A completes a sale
  │
  ├─ [0 ms]   Local store updated, operation added to localStorage queue
  │
  ├─ [0–15 s] syncManager flushes queue to Supabase
  │            • Immediate flush if connected + not already syncing → ~0 ms
  │            • foreground recovery → check connection, then flush
  │            • Otherwise waits for next 15 s tick
  │
  └─ [network latency] Supabase broadcasts postgres_changes and the receiving
                       store merges that row directly
```

---

## Key Files

| File | Role |
|---|---|
| `src/lib/syncManager.ts` | Queues operations, flushes immediately or on the 15 s fallback interval. Dead-letter queue for failed ops. |
| `src/lib/syncQueue.ts` | localStorage-backed FIFO queue with retry counting + dead-letter queue |
| `src/lib/connectionStatus.ts` | Tracks online/Supabase status with a single-flight, whole-operation 10 s check deadline |
| `src/lib/foregroundRecovery.ts` | Awaits connectivity, flushes the queue, then runs catch-up loads |
| `src/components/common/SyncInitializer.tsx` | On mount: flush + load. On realtime: row merge. On foreground: coalesced recovery |
| `src/components/common/SyncStatus.tsx` | Shows sync status, dead-letter count with retry button |
| `src/hooks/useRealtimeSync.ts` | Subscribes to Supabase `postgres_changes` per table |

---

## Sync Reliability Features

### Dead-letter queue (prevents silent data loss)

When a sync operation fails after 3 retries, it is moved to a **dead-letter queue** instead of
being silently discarded. The user sees a persistent warning badge in the sidebar with a "Retry"
button. Operations in the dead-letter queue are persisted to `localStorage` and survive page refreshes.

### Visibility change handlers (fixes background→foreground delay)

When the PWA returns from background (or a browser tab regains focus):
1. Concurrent `visibilitychange`, `focus`, and `pageshow` triggers join one connectivity check.
2. The check covers auth-token lookup and the database probe, and settles within 10 seconds.
3. Only after a healthy result does foreground recovery flush pending writes.
4. Products/customers run delta catch-up; transactions and SAT keys reload.

This eliminates the 2–3 minute delay previously experienced when switching back to the app.

### Soft-delete `updated_at` (fixes deleted records persisting)

All soft-delete operations now set `updated_at` alongside `is_deleted` and `deleted_at`.
This ensures the LWW merge logic on other devices recognizes the delete as the newest write.

### Stale ghost record removal (fixes deleted records on other devices)

`mergeProducts()`, `mergeCustomers()`, and `mergeTransactions()` now check local-only records
against the sync queue. If a record exists locally but not in the remote set AND is not pending
in the sync queue, it is removed as a stale ghost (was deleted on the server).

### localStorage quota protection (all stores)

All three stores (`productStore`, `customerStore`, `transactionStore`) wrap `localStorage` writes
in try/catch. If the write fails due to quota limits, data remains in Zustand memory and is still
synced to Supabase.

---

## Tuning Options

### Reduce the sync delay further

The fallback interval is currently 15 seconds. It can be reduced if production traffic permits:

```
}, 10_000); // flush every 10 seconds
```

---

## Known Edge Cases

| Scenario | Behavior | Risk |
|---|---|---|
| Two users add products to same UPS batch | Both succeed (different IDs); barcode collision guard walks to next free sequence | Low |
| Two users edit different products | Both succeed independently | None |
| Two users edit the **same** product simultaneously | Last writer wins, first edit lost silently | Medium |
| User A deletes, User B edits the same product | `is_deleted=true` may be overwritten back by B's update | Medium |
| User adds product while offline, reconnects | Queued op syncs, then foreground delta/full catch-up runs | Low |
| Rapid "Save & Add Another" | Sequential queue, no parallel conflicts | Low |

---

## Queue Persistence

Operations are stored in `localStorage` under the sync queue key. They survive:
- Page refreshes
- Browser tab closes (if reopened on the same device)

They do **not** survive:
- Clearing browser data
- Using a different device (each device has its own queue)

---

## Offline Behavior

When the device goes offline:
- Writes continue to work locally (optimistic UI)
- Queue accumulates in `localStorage`
- On reconnect, `connectionStatus` notifies `syncManager`, which immediately flushes the queue

The `SyncStatus` indicator in the sidebar shows pending queue count and last sync time.

---

## Scenario Analysis

Real-world multi-user scenarios examined against the actual source code.

---

### Scenario 1 — Three users adding products simultaneously ✅ Safe

**Verdict: All products reach the DB correctly. No data loss.**

`addProduct()` in `productStore.ts` generates a UUID via `generateId()` before the upsert.
Each of the three new products gets a globally unique `id`. The Supabase upsert uses
`{ onConflict: 'id' }`, so the three operations never collide — they insert into three
separate rows regardless of the order they arrive at the DB.

Users see each other's new products when the realtime row event arrives. If realtime was suspended,
the next foreground delta catch-up provides the recovery path.

**Summary:**
- Inventory integrity: ✅ Guaranteed
- Visibility delay: normally network/realtime latency; up to the fallback flush interval before upload
- Risk: None

---

### Scenario 2 — Browser tab vs PWA standalone window ⚠️ Mostly identical; one mobile caveat

**Verdict: Functionally identical on desktop. One important caveat on mobile.**

The entire sync stack is pure JavaScript:
- `localStorage` queue — same API in browser tab and PWA
- Supabase Realtime WebSocket — same connection in both contexts
- `setInterval` (15 s fallback flush) — same JavaScript timer
- Zustand store — same in-memory state

In practice, opening the app as a PWA on desktop behaves identically to a browser tab.

**The one real difference — mobile OS backgrounding:**

On Android and iOS, the OS may throttle or fully pause JavaScript execution when the PWA is
backgrounded (app switcher) or the screen locks. The 15 s `setInterval` will not fire while
the app is paused.

This is mitigated by two mechanisms:
1. `connectionStatus.ts` listens for foreground events and coalesces them into one bounded check.
2. `SyncInitializer.tsx` awaits that result before flushing and catching up local stores.

**Worst-case mobile flow:**
1. Seller completes a sale → queued locally
2. Seller minimizes the PWA (OS pauses JS)
3. Timer never fires while backgrounded
4. Seller re-opens the PWA → connectivity check → queue flush → data catch-up

Data is never lost; it syncs within seconds of re-opening the app.

**Summary:**
- Desktop (browser or PWA): ✅ Identical behavior
- Mobile (backgrounded): ✅ Bounded connection recovery, flush, and catch-up on foreground

---

### Scenario 3 — Two sellers sell the same product concurrently 🔴 Race condition

**Verdict: Transactions are always correct. Inventory quantity may be under-counted.**

#### Transactions — ✅ Always correct

`addTransaction()` in `transactionStore.ts` generates a new UUID for each sale and queues a
`transactions:create` operation. Two simultaneous sales produce two independent inserts that
never conflict. Both appear in the transaction log. Revenue totals, customer purchase history,
and sales reports are always accurate.

#### Inventory quantity — 🔴 Race condition under concurrent sales

**Code path (`productStore.ts` → `syncManager.ts`):**

`updateProduct()` reads the current local product object, applies the new field values
(including `availableQty` and `soldQty`), and sends the **entire product object** as an
absolute upsert — not a delta/increment. The new `availableQty` is computed as
`localQty - soldAmount` using whatever the local Zustand store holds at the moment of the sale.

**Concrete example — Thermometer with `availableQty = 10`:**

```
Both Seller 1 (S1) and Seller 2 (S2) have loaded the product.
Neither has received a realtime update from the other.

S1 sells 1:
  localQty = 10
  updateProduct → { availableQty: 10-1=9, soldQty: 0+1=1, updatedAt: T1 }
  → upserted to DB: available_qty = 9  ✅

S2 sells 1 (before S1's realtime event reaches S2):
  localQty = 10  ← stale, hasn't seen S1's write yet
  updateProduct → { availableQty: 10-1=9, soldQty: 0+1=1, updatedAt: T2 }
  → upserted to DB: available_qty = 9  ← overwrites S1's correct 9 with a stale 9

DB result:  available_qty = 9,  sold_qty = 1
Correct result should be:  available_qty = 8,  sold_qty = 2
```

The `mergeProducts()` function uses last-write-wins on `updatedAt`. This does not help here —
both sellers computed `availableQty = 9`, and the merge simply confirms the later (wrong) value.

#### Why this is hard to fix in the current architecture

A correct fix requires one of:

- **Atomic DB-level decrements** — `UPDATE products SET available_qty = available_qty - 1`
  instead of sending an absolute value. Supabase RPC or raw SQL would be needed.
- **Optimistic locking** — read the current `updated_at` from the DB before writing; reject
  the write if the DB row has been updated since the local read (i.e., someone else already
  sold one). The client would then reload and retry.

The current architecture was designed for single-user with background sync. Neither pattern
is implemented. Adding either would require changes to `productStore.ts`, `syncManager.ts`,
and the Supabase table (for locking: a version column or compare-and-swap RPC).

#### Probability assessment

The race condition requires all of the following to be true simultaneously:
- Two sellers are selling the **exact same product** (same `id`)
- Both sales happen within the same ~3–65 s sync window
- Neither seller has received the other's realtime update before completing their sale

For businesses with diverse inventory spread across multiple sellers, this is rare.
It becomes more likely for high-demand items (e.g., a single popular product) managed
by multiple sellers at the same time.

**Summary:**
| What | Status |
|---|---|
| Transaction log (revenue, history) | ✅ Always correct — UUID inserts never conflict |
| `availableQty` / `soldQty` on product | 🔴 May be under-counted under concurrent sales |
| Probability (typical diverse inventory) | Low |
| Probability (single hot item, multiple sellers) | Medium |
| Fix complexity | High — requires atomic DB operations or optimistic locking |

---

## Additional Known Risks

---

### Risk 1 — `customer.balance` has the same race condition as inventory qty 🔴

**File:** `src/store/customerStore.ts:114` — `addPurchase()`

`addPurchase()` follows the identical absolute-overwrite pattern as `updateProduct()`. It reads the
local `customer.balance`, adds the credit amount, and upserts the **full customer object** with the
new absolute value. Two sellers processing credit sales for the same customer simultaneously will
produce the same result as the inventory race:

```
Customer has balance = 0

S1 sells $50 on credit:
  addPurchase(id, 50) → { balance: 0+50=50 } → upserted to DB: balance=50  ✅

S2 sells $30 on credit (before S1's event arrives):
  addPurchase(id, 30) → { balance: 0+30=30 } → upserted to DB: balance=30  ← WRONG (should be 80)
```

**What IS safe:** Both sale transactions exist correctly in the transaction log with proper amounts.
`getEffectivePendingMap()` re-derives debt from raw transactions and will show the correct per-sale
breakdown.

**What IS at risk:** The `customer.balance` field in the DB, and therefore `getTotalOutstandingBalance()`
in Reports, may under-count the total debt owed.

**Probability:** Same as inventory — low for typical use, higher when multiple sellers run credit sales
for the same popular customer in the same sync window.

---

### Risk 2 — "Sales by Category" in Reports is not date-filtered ⚠️

**File:** `src/pages/Reports.tsx:78`, `src/store/transactionStore.ts:234`

`getTotalSalesByCategory()` iterates **all** transactions of type `'sale'` with no date filter.
The "Today / Last Week / Last Month" picker has no effect on the Sales by Category section — it
always shows all-time category totals regardless of the selected period.

All other sections on the Reports page (revenue, top products, payment breakdown, transaction list)
correctly use the date-filtered `filteredTransactions`. The category chart is the only outlier.

**Impact:** A user selecting "Today" will see today's revenue at the top, but all-time category
percentages below — potentially misleading.

---

### Risk 3 — Payment breakdown will not sum to total when credit sales exist ⚠️

**File:** `src/pages/Reports.tsx:70–73`

For a credit sale with `total = 100`, `cashAmount = 60`, credit balance = 40:
- `totalSales` counts $100 (correct — the full sale value)
- `cashSales` counts $60 (correct — what was physically received)
- The three payment columns sum to $60, not $100

There is no label, note, or warning explaining the gap. A user reconciling the payment breakdown
against the total will find a shortfall equal to the total outstanding credit across the period.

This is not a calculation bug — it reflects real business reality (sold $100, collected $60) — but
the UI does not communicate it, which can cause confusion during end-of-day reconciliation.

---

### Risk 4 — Outstanding balance card and per-transaction detail can diverge ⚠️

Two independent code paths compute customer debt:

| Path | Source | Used in |
|---|---|---|
| `customer.balance` field | Stored number, updated by `addPurchase` / `receivePayment` | Reports summary card, `getCustomersWithBalance()` |
| `getEffectivePendingMap()` | Re-derived from raw transactions (FIFO) | Per-customer debt breakdown |

If `customer.balance` becomes stale due to the concurrent race condition (Risk 1), the Reports
summary card will show a lower total than what the transaction-level detail shows. The transaction
path is more reliable because it reads immutable source records.

---

### Risk 5 — Full product reload on every realtime event ✅ Resolved

Realtime product and customer events now merge the changed row directly. Foreground recovery uses
timestamp-based delta fetches, with a periodic full-snapshot backstop for missed events.

---

### Risk 6 — Realtime transaction inserts omit item rows ⚠️

**File:** `src/store/transactionStore.ts:304` — `convertDbTransaction()`

The realtime handler (`handleRealtimeUpdate`) calls `convertDbTransaction()`, which sets `items: []`
because item rows are fetched separately and are not included in the transaction realtime payload.
The next transaction full reload (startup or foreground recovery) hydrates the item rows.

```
[0 ms]       Realtime event fires → transaction stored with items: []
[foreground] Recovery runs loadFromSupabase() → transaction items are hydrated
```

**Impact:** Sales-by-item views can be incomplete until the next transaction reload. This is not a
database integrity issue, but transaction-item realtime hydration remains a separate follow-up.

---

### Risk 7 — `localStorage` quota protection ✅ FIXED

All three stores (`productStore`, `customerStore`, `transactionStore`) now wrap `localStorage` writes
in try/catch. If the write fails due to quota limits, data remains in Zustand memory and is still
synced to Supabase via the queue or direct-sync fallback.

---

## Supabase Free Tier Limits

| Limit | Free tier cap | Risk for this app |
|---|---|---|
| **Realtime concurrent connections** | 200 | Each open tab creates **3 channels** (products, transactions, customers). Cap reached at ~66 simultaneous open tabs. Fine for a small team. |
| **Realtime messages per second** | 100/s | Low risk under normal use. A bulk Excel import triggering many writes could briefly spike this. |
| **Database storage** | 500 MB | Watch as transactions accumulate. Each sale with items adds multiple rows. No automatic cleanup. |
| **Database egress** | 2 GB/month | **Highest practical risk.** Full table reloads on every realtime event (Risk 5) can consume this quickly with a growing catalog and multiple active users. |
| **Project auto-pause** | After 7 days inactivity | **Critical for production.** The project pauses automatically after a week of no activity. The app will fail to connect until manually unpaused in the Supabase dashboard. Not acceptable for a live business. **Upgrade to Pro ($25/mo) to disable auto-pause.** |
| **Monthly active users (auth)** | 50,000 | Not a concern at current scale. |

### Connection math

```
Users simultaneously online × 3 channels = total connections
10 sellers × 3 = 30 connections    ← fine on free tier
50 sellers × 3 = 150 connections   ← approaching limit
67 sellers × 3 = 201 connections   ← exceeds free tier cap
```

Connections over the limit are rejected. The Supabase JS client reconnects automatically when
throughput drops back below the limit, but affected users will miss realtime events in the
interim and will only recover after their next full reload.

---

## Duplicate Barcode — Applied Fix (Fix 1) and Planned Fix (Fix 2)

### Background

Migration `003_fix_barcode_constraint.sql` intentionally dropped the DB-level `UNIQUE` constraint
on `barcode` to fix 409 errors during Excel re-imports (same product, different UUIDs). This left
the system with no guard against two devices generating the same barcode in the same sync window.

**Root cause:** `getNextDropSequence()` reads the local Zustand store, not the DB. Two devices
with stale local state (before the realtime event arrives) both compute `maxSequence + 1` and
produce identical barcodes like `D1-0006`.

---

### Fix 1 — Applied (local collision walk-forward) ✅

**File:** `src/store/productStore.ts` — `getNextDropSequence()`

After computing `maxSequence + 1`, the function now checks whether the candidate barcode is
already present in the full local product list (across all drops, not just the current one). If it
is, it increments until it finds a barcode that is not taken.

```ts
const existingBarcodes = new Set(
  get().products.map((p) => p.barcode).filter(Boolean),
);
let candidate = maxSequence + 1;
while (existingBarcodes.has(generateLegacyBarcode(dropNumber, candidate))) {
  candidate++;
}
return candidate;
```

**What this solves:** If Device A's collision has already synced down to Device B's store, Device B
will skip that sequence and use the next free one. This eliminates the duplicate entirely in the
common case (the race window is ~3–65 s; most add-product flows take longer than that).

**Remaining gap:** If both devices are mid-race (neither has seen the other's barcode yet), they
can still collide on the same sequence in the same sync window. Fix 1 prevents *most* duplicates
but not a perfectly simultaneous race. Fix 2 is required for a hard guarantee.

---

### Fix 2 — Planned (DB-level unique constraint with server-side sequence) 🔲

This is the correct long-term solution. It requires a Supabase migration and changes to the
upsert logic.

#### Step 1 — Add barcode unique constraint back

```sql
-- supabase/migrations/00X_barcode_unique_constraint.sql
ALTER TABLE public.products
  ADD CONSTRAINT products_barcode_unique UNIQUE (barcode);
```

#### Step 2 — Handle 409 conflicts in syncManager

When an upsert hits a unique-constraint violation on `barcode` (Postgres error code `23505`), the
sync manager should:
1. Fetch the current max sequence for that `dropNumber` from the DB (one extra SELECT).
2. Re-generate the barcode using `maxSequence + 1`.
3. Update the product in the local store with the new barcode + sequence.
4. Retry the upsert.

This is the only path that is immune to the simultaneous-race case.

#### Step 3 — Fix re-import 409s (why the constraint was removed)

The original problem was Excel re-import: the same product arrives as a *new* UUID because the
match-key logic falls through. The correct fix is to ensure `syncExcelProducts()` always routes
matched products through `updateProduct()` (preserving the existing barcode) rather than
`addProduct()` (generating a new one). If the existing barcode is already on the upserted row,
the unique constraint is satisfied.

#### Why Fix 2 is deferred

- Requires a Supabase migration (cannot be rolled back easily on free tier).
- Requires testing all Excel import paths to confirm no new 409 regressions.
- Fix 1 reduces the real-world duplicate rate to near-zero for normal use without touching the DB.

**Pre-condition before running Fix 2:** Audit the DB for any existing duplicate barcodes and
resolve them first. Two products with the same barcode will prevent the `ADD CONSTRAINT` from
succeeding until the duplicates are cleaned up.
