-- Migration: Add 'expired' and 'lost' statuses to products table
-- This allows tracking products that have expired or been lost/stolen

-- Drop existing constraint and add new one with expanded status values
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_status_check;
ALTER TABLE public.products ADD CONSTRAINT products_status_check
  CHECK (status IN ('available', 'sold', 'reserved', 'promotional', 'donated', 'review', 'expired', 'lost'));

-- Drop and recreate recalculate_drop_stats to fix available count
-- (must DROP first because existing function uses parameter name "p_drop_number")
DROP FUNCTION IF EXISTS recalculate_drop_stats(TEXT);

-- Available count should include: available, reserved, promotional
CREATE OR REPLACE FUNCTION recalculate_drop_stats(p_drop_number TEXT)
RETURNS void AS $$
DECLARE
  stats RECORD;
BEGIN
  SELECT
    COUNT(*) AS total_products,
    COALESCE(SUM(quantity), 0) AS total_units,
    COALESCE(SUM(quantity * unit_price), 0) AS total_value,
    COUNT(*) FILTER (WHERE status = 'sold') AS sold_count,
    COUNT(*) FILTER (WHERE status IN ('available', 'reserved', 'promotional')) AS available_count
  INTO stats
  FROM products
  WHERE drop_number = p_drop_number
    AND is_deleted = false;

  UPDATE drops
  SET
    total_products = stats.total_products,
    total_units = stats.total_units,
    total_value = stats.total_value,
    sold_count = stats.sold_count,
    available_count = stats.available_count,
    updated_at = NOW()
  WHERE drop_number = p_drop_number;
END;
$$ LANGUAGE plpgsql;

-- Add comment explaining status values
COMMENT ON COLUMN public.products.status IS 'Product status: available (in stock), sold, reserved (held for customer), promotional (discounted), donated, review (needs verification), expired (past use-by date), lost (missing/stolen)';
