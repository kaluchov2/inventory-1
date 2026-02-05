-- ============================================
-- Migration: Add Review Status and Notes Field
-- Adds: 'review' status option, notes column
-- ============================================

-- 1. Add notes column to products table
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- 2. Update status constraint to include 'review'
-- First drop the old constraint
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_status_check;

-- Add new constraint with 6 status values (including 'review')
ALTER TABLE public.products
  ADD CONSTRAINT products_status_check
  CHECK (status IN ('available', 'sold', 'reserved', 'promotional', 'donated', 'review'));

-- 3. Create index for notes field (partial index for non-null values)
CREATE INDEX IF NOT EXISTS idx_products_notes ON public.products(notes)
  WHERE notes IS NOT NULL;

-- 4. Create index for review status (for quick filtering)
CREATE INDEX IF NOT EXISTS idx_products_status_review ON public.products(status)
  WHERE status = 'review';
