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
| Typical case — queue was partway through 60 s interval | ~30–35 seconds |
| Worst case — 60 s timer just reset when the sale happened | ~63–65 seconds |

The dominant factor is the **60-second flush interval** in `syncManager.ts`.

---

## Step-by-step Timing Breakdown

```
User A completes a sale
  │
  ├─ [0 ms]   Local store updated, operation added to localStorage queue
  │
  ├─ [0–60 s] syncManager flushes queue to Supabase
  │            • Immediate flush if connected + not already syncing → ~0 ms
  │            • Otherwise waits for next 60 s tick → up to 60 s
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
| `src/lib/syncManager.ts` | Queues operations, flushes to Supabase on 60 s interval or immediately |
| `src/lib/syncQueue.ts` | localStorage-backed FIFO queue with retry counting |
| `src/components/common/SyncInitializer.tsx` | On mount: flush + load. On realtime event: debounced reload |
| `src/hooks/useRealtimeSync.ts` | Subscribes to Supabase `postgres_changes` per table |

---

## Tuning Options

### Reduce the sync delay

In `src/lib/syncManager.ts`, change the interval from `60000` to `5000`–`10000` ms:

```ts
// Line ~63 in syncManager.ts
}, 10000); // flush every 10 seconds instead of 60
```

This reduces the worst-case delay from ~65 s to ~15 s with minimal overhead.

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
