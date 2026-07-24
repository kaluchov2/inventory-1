# Sale Sync Concurrency Hardening (July 23, 2026)

## What this fixes

A mobile/PWA request can time out locally while PostgreSQL is still finishing the
original `record_sale` call. A retry with the same transaction id could previously
pass the initial existence check before the first call committed. Although the
second header insert used `ON CONFLICT DO NOTHING`, it could still continue into
line-item inserts, stock movement, and customer balance updates.

Migration `023_harden_record_sale_concurrency.sql` now:

- takes a transaction-scoped advisory lock derived from the sale transaction id;
- rechecks whether the sale already exists after acquiring that lock; and
- requires `INSERT ... RETURNING id` to prove that this execution owns the new
  transaction before applying any non-idempotent side effects.

Concurrent retries for the same sale therefore serialize. After the first call
commits, later calls return without duplicating items, stock movement, or customer
balance changes.

## Missing RPC behavior

`syncRecordedSale` no longer falls back to separate client-side writes when the
`record_sale` function is missing. That fallback could persist the transaction
header and then fail before items, stock, or customer updates completed.

The app now fails closed: the persisted queue retains/retries the sale and
eventually surfaces it through dead-letter handling. A missing RPC must be fixed
by deploying the database migrations, not by partially applying a sale.

## Timeout

The `record_sale` timeout remains 45 seconds. This is a maximum wait for a hung
request, not a delay applied to normal sales. Successful calls continue
immediately.

## Required deployment

Deploy migration `023_harden_record_sale_concurrency.sql` before considering the
concurrent retry race fixed in production.
