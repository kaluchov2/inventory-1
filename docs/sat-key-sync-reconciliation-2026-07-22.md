# SAT Key Sync Reconciliation & Dead-Letter Hardening (July 22, 2026)

## Why this document
Records the fix for the incident where editing a product and assigning a SAT
key left sync operations stuck in the yellow "pending" state — some syncing
after an app restart, others never draining. Shipped in commit `4ad885d`.

## The incident
- A client edited products and assigned a SAT clave.
- The sync indicator sometimes stayed yellow ("pendiente").
- On close/reopen, some operations synced and others did not.
- `products.sat_key_id` is a foreign key to `sat_keys.id`, added recently
  together with the SAT catalog.

## Root causes
1. **Head-of-line blocking + reordering.** A rejected product/SAT operation
   could sit at the front of the FIFO queue. An earlier attempt to move failed
   operations to the tail broke ordering: an `update` reordered after a
   `delete` resurrected the product (product upsert always writes
   `is_deleted: false`), and two updates of the same product could be inverted.
2. **SAT foreign-key rejections retried forever.** A `products` write whose
   `sat_key_id` pointed at a row that did not exist server-side failed with
   Postgres `23503`. It was retried like a transient error, kept the UI yellow,
   and could be re-queued indefinitely.
3. **SAT id/code mismatch across devices.** Two devices could create the same
   SAT code with different local ids. The old `syncSatKey` rewrote the remote
   primary key to the local id, cascading FK changes and breaking other
   devices' references.
4. **Message and queue-recovery gaps.** The SAT-specific error was overwritten
   by a generic end-of-loop message; `remapSatKeyId` did not cover the
   dead-letter queue; `retryDeadLetter` cleared entries before re-enqueuing
   (loss/duplication risk under localStorage failures); and the "discard"
   action left older snapshots of the same product behind.

## Fixes implemented

### 1) Serialized sync (`src/lib/syncManager.ts`)
- A single `activeSyncPromise` is shared by concurrent callers, so the auto
  flush interval, reconnect events, and `forceSync()` can never upload the same
  operation in parallel. `forceSync()` joins the active run instead of resetting
  the lock.

### 2) FIFO preserved for products and SAT keys (`src/lib/syncManager.ts`)
- Product and `sat_keys` operations are never reordered. This removes the
  update-after-delete resurrection and the two-updates inversion. (Only a
  timed-out `record_sale` is still moved to the tail.)

### 3) 23503 is non-retryable (`src/lib/syncManager.ts`)
- A foreign-key violation goes straight to the dead-letter queue — no retries,
  no backoff spin.
- Product SAT-FK failures are tagged `failureReason: 'sat_key_foreign_key'`.
- The SAT-specific message ("La clave SAT del producto no existe…") is held in
  `persistentError` and is not overwritten by the generic end-of-loop error.

### 4) SAT key canonicalization (`src/lib/syncManager.ts`, `src/lib/satKeyResolution.ts`)
- When the code already exists remotely under a different id, adopt the remote
  (canonical) id — never rewrite the server primary key.
- If the initial `SELECT` returns null but the `UPSERT` hits `23505` (a race),
  re-query, adopt the canonical row, and continue.
- On adoption, dependent operations are remapped and a resolution is published
  on a small local bus (`satKeyResolution.ts`) so the stores update their state.

### 5) Queue / dead-letter remapping (`src/lib/syncQueue.ts`)
- `remapSatKeyId(localId, canonicalId)` rewrites the local id to the canonical
  id across the active queue **and** the dead-letter queue, including
  nested/batch payloads (`items`, `transaction.items`, `sale_update.snapshot`,
  `batch_*` arrays).
- Writes are rolled back in memory and best-effort restored in localStorage if
  persistence fails.
- `retryDeadLetter` no longer clears first: it re-enqueues, keeps only the
  operations that never reached the main queue on failure, and avoids
  duplicating between queue and dead-letter when `removeItem` fails.

### 6) Structured UI + safe discard (`src/components/common/SyncStatus.tsx`, `src/lib/syncManager.ts`)
- `SyncStatus` reads a structured `hasSatKeyDeadLetter` flag computed from
  `failureReason` (not a substring of the last error), so it survives mixed
  errors and old messages.
- When set, the badge shows **"Clave SAT no encontrada — Descartar"**.
- `discardSatKeyDeadLetters()` removes the SAT-blocked snapshots **and** any
  older dead-letter snapshots for those same products, so the user's corrected
  save is authoritative and cannot be overwritten by a stale snapshot. The user
  is instructed to pick a valid SAT key and save the product again.

### 7) Local stores follow canonical ids (`src/store/productStore.ts`, `src/store/satKeyStore.ts`)
- Both stores subscribe to the resolution bus: `satKeyStore` replaces the local
  SAT key with the canonical one, and `productStore` re-points products that
  referenced the stale local id.

## Validation
- `npm test`: 13 files, 39 tests passing (adds coverage for valid SAT sync,
  23503 → immediate dead-letter, FIFO update→delete, canonical id adoption,
  concurrent manual retry, SAT message persistence, and dead-letter remap /
  discard).
- `npm run build`: OK.

## Known follow-ups (out of scope for this fix)
- `sale_update` after a remote timeout can still double-decrement stock
  (`verifyOperationApplied` does not cover `sale_update`) — pre-existing.
- The auth/session-refresh sub-path of `connectionStatus.forceCheck()` has no
  `AbortController`; a hang there is not recoverable — pre-existing, unchanged.
- Adopting a canonical SAT key silently drops a locally edited description
  (server wins by design); consider a toast to make it visible.
