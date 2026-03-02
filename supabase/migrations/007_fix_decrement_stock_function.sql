-- Fix: decrement_stock parameter type mismatch
-- products.id is TEXT, not uuid — PostgreSQL cannot compare text = uuid without a cast.
-- Drop and recreate with the correct parameter type.

CREATE OR REPLACE FUNCTION decrement_stock(product_id text, qty int)
RETURNS void AS $$
  UPDATE products
  SET available_qty = available_qty - qty,
      sold_qty = sold_qty + qty,
      updated_at = now()
  WHERE id = product_id AND available_qty >= qty;
$$ LANGUAGE sql;
