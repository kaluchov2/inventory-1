-- Run this manually against the live Supabase project during a quiet window.
-- Do not wrap this file in a transaction block.
-- If Supabase SQL Editor returns:
--   ERROR: CREATE INDEX CONCURRENTLY cannot run inside a transaction block
-- then run this from a direct Postgres client instead of the dashboard SQL runner.
-- Good options:
--   - psql in autocommit mode
--   - DBeaver / TablePlus / pgAdmin with autocommit on
-- Suggested invocation:
--   psql "$PROD_URL" -f scripts/manual-delta-sync-indexes.sql
--
-- If a previous CREATE INDEX CONCURRENTLY attempt was interrupted, first inspect:
--   SELECT c.relname, i.indisvalid
--   FROM pg_index i
--   JOIN pg_class c ON c.oid = i.indexrelid
--   WHERE c.relname IN ('idx_products_updated_at_id', 'idx_customers_updated_at_id');
--
-- For any row with indisvalid = false, run one of these manually before retrying:
--   DROP INDEX CONCURRENTLY idx_products_updated_at_id;
--   DROP INDEX CONCURRENTLY idx_customers_updated_at_id;
--
-- These indexes support product/customer delta catch-up queries:
--   updated_at >= <windowStart>
--   order by updated_at asc, id asc

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_updated_at_id
  ON public.products (updated_at, id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_updated_at_id
  ON public.customers (updated_at, id);

SELECT c.relname, i.indisvalid
FROM pg_index i
JOIN pg_class c ON c.oid = i.indexrelid
WHERE c.relname IN ('idx_products_updated_at_id', 'idx_customers_updated_at_id');
