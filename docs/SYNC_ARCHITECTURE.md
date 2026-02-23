# Sync Architecture — Multi-User Timing Reference

## Overview

The system uses an **optimistic local-first** approach:

1. A sale (or any write) updates the in-memory store and queues the operation to `localStorage` — **instantly visible to the current user**.
2. `syncManager` flushes the queue to Supabase in the background.
3. Supabase emits a `postgres_changes` realtime event to all connected clients.
4. `SyncInitializer` debounces the event by **2 seconds**, then calls `loadFromSupabase()` which reloads the full dataset (~1–2 s).

---

## How Long Until Other Users See a Change?

| Scenario | Wait time |
|---|---|
| Best case — queue flushed immediately | ~3–4 seconds |
| Typical case — queue was partway through 10 s interval | ~7–8 seconds |
| Worst case — 10 s timer just reset when the sale happened | ~13–15 seconds |

The flush interval in `syncManager.ts` is **10 seconds**. Additionally, `visibilitychange` events
trigger an immediate flush + reload when the app returns from background.

---

## Step-by-step Timing Breakdown

```
User A completes a sale
  │
  ├─ [0 ms]   Local store updated, operation added to localStorage queue
  │
  ├─ [0–10 s] syncManager flushes queue to Supabase
  │            • Immediate flush if connected + not already syncing → ~0 ms
  │            • visibilitychange (app returns to foreground) → immediate flush
  │            • Otherwise waits for next 10 s tick → up to 10 s
  │
  ├─ [+500 ms–2 s] Supabase replicates to realtime layer,
  │                broadcasts postgres_changes to all subscribers
  │
  ├─ [+2 s]   SyncInitializer debounce fires → loadFromSupabase() called
  │            (debounce collapses burst events from a single sale into one reload)
  │
  └─ [+1–2 s] loadFromSupabase() fetches & merges data → User B sees updated Products page
```

---

## Key Files

| File | Role |
|---|---|
| `src/lib/syncManager.ts` | Queues operations, flushes to Supabase on 10 s interval or immediately. Dead-letter queue for failed ops. |
| `src/lib/syncQueue.ts` | localStorage-backed FIFO queue with retry counting + dead-letter queue |
| `src/lib/connectionStatus.ts` | Tracks online/Supabase status. `visibilitychange` triggers immediate re-check |
| `src/components/common/SyncInitializer.tsx` | On mount: flush + load. On realtime: debounced reload. On foreground: flush + reload |
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
1. `connectionStatus.ts` re-checks Supabase connectivity immediately
2. `SyncInitializer.tsx` flushes the pending queue, then reloads all data from Supabase

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

The interval is currently 10 seconds. It can be reduced to 5 seconds for even faster sync:

```ts
// Line ~65 in syncManager.ts
}, 5000); // flush every 5 seconds
```

### Reduce the debounce delay

In `src/components/common/SyncInitializer.tsx`, the `2000` ms debounce can be reduced
to `500` ms if burst events are no longer a concern:

```ts
productReloadTimer.current = setTimeout(() => { ... }, 500);
```

---

## Known Edge Cases

| Scenario | Behavior | Risk |
|---|---|---|
| Two users add products to same UPS batch | Both succeed (different IDs) | None |
| Two users edit different products | Both succeed independently | None |
| Two users edit the **same** product simultaneously | Last writer wins, first edit lost silently | Medium |
| User A deletes, User B edits the same product | `is_deleted=true` may be overwritten back by B's update | Medium |
| User adds product while offline, reconnects | Queued op syncs on reconnect, then full reload | Low |
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

Users won't see each other's new products until the realtime event fires and the 2 s debounce
resolves (~3–15 s depending on where each client is in the flush interval), but every product
is persisted without loss or overwrite.

**Summary:**
- Inventory integrity: ✅ Guaranteed
- Visibility delay: up to ~65 s (see timing table above)
- Risk: None

---

### Scenario 2 — Browser tab vs PWA standalone window ⚠️ Mostly identical; one mobile caveat

**Verdict: Functionally identical on desktop. One important caveat on mobile.**

The entire sync stack is pure JavaScript:
- `localStorage` queue — same API in browser tab and PWA
- Supabase Realtime WebSocket — same connection in both contexts
- `setInterval` (60 s flush) — same JavaScript timer
- Zustand store — same in-memory state

In practice, opening the app as a PWA on desktop behaves identically to a browser tab.

**The one real difference — mobile OS backgrounding:**

On Android and iOS, the OS may throttle or fully pause JavaScript execution when the PWA is
backgrounded (app switcher) or the screen locks. The 10 s `setInterval` will not fire while
the app is paused.

This is mitigated by two mechanisms:
1. `connectionStatus.ts` listens for `visibilitychange` → re-checks Supabase connectivity immediately
2. `SyncInitializer.tsx` listens for `visibilitychange` → flushes pending queue + reloads all data

**Worst-case mobile flow:**
1. Seller completes a sale → queued locally
2. Seller minimizes the PWA (OS pauses JS)
3. Timer never fires while backgrounded
4. Seller re-opens the PWA → `visibilitychange` fires → queue flushes + data reloads within seconds

Data is never lost; it syncs within seconds of re-opening the app.

**Summary:**
- Desktop (browser or PWA): ✅ Identical behavior
- Mobile (backgrounded): ✅ Flush + reload on foreground via `visibilitychange`

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

### Risk 5 — Full product table reload on every realtime event ⚠️

**File:** `src/components/common/SyncInitializer.tsx` (debounce handler) →
`productStore.loadFromSupabase()` → `productService.getAll()`

Every realtime event — any product change from any user — triggers `SELECT * FROM products` with no
pagination or incremental fetch. Today this is fast. As the catalog grows:

- **Performance:** Query time grows linearly with product count.
- **Egress:** With 5 connected users and 50 product changes per day, a 1,000-product table
  (≈ 1 KB/row) generates roughly `5 users × 50 events × 1 MB = 250 MB/day` in egress — well
  over the free tier's 2 GB/month allowance within a couple of weeks of active use.

The same reload pattern applies to transactions and customers, compounding the egress cost.

**No fix is in scope for the current architecture.** A proper solution would use incremental
sync (fetch only rows with `updated_at > last_sync`) or Supabase Realtime row-level payloads
instead of triggering a full reload.

---

### Risk 6 — Transaction items flash empty for ~2–3 seconds after a realtime event ⚠️

**File:** `src/store/transactionStore.ts:304` — `convertDbTransaction()`

The realtime handler (`handleRealtimeUpdate`) calls `convertDbTransaction()`, which always sets
`items: []` — items are fetched separately by the service and are not included in the realtime
payload. The sequence on a new sale from another user:

```
[0 ms]    Realtime event fires → handleRealtimeUpdate → transaction stored with items: []
[0–2 s]   Reports page: topProducts recalculated → new transaction contributes $0 to every product
[+2 s]    Debounce fires → loadFromSupabase() → transaction reloaded with correct items
[+1–2 s]  topProducts recalculated correctly
```

**Impact:** The top products table and sales-by-item data briefly show incorrect totals. It
self-corrects within ~3–4 seconds. Not a data integrity issue, but a visible flicker if the
Reports page is open when another user completes a sale.

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
