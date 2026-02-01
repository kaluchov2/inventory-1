-- ============================================
-- Migration: Fix Barcode Constraint
-- Issue: 409 duplicate barcode errors on re-import
-- Solution: Remove unique constraint/index on barcode column
-- ============================================

-- Drop the unique constraint on barcode (both possible naming conventions)
-- PostgreSQL names constraints differently depending on how they were created:
-- - products_barcode_key: created with UNIQUE keyword on column definition
-- - products_barcode_unique: manually named constraint or index

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_barcode_key;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_barcode_unique;

-- Also drop as index (unique indexes enforce uniqueness but aren't constraints)
DROP INDEX IF EXISTS products_barcode_unique;
DROP INDEX IF EXISTS products_barcode_key;
