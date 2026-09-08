-- Run sections 1 and 2 before migration 030 and save/export the results.
-- Run them again after migration 030; the invariant totals must be identical.

-- 1. Inventory report by UPS and state (includes already deleted rows).
SELECT
  COALESCE(NULLIF(BTRIM(product.drop_number), ''), product.ups_batch::text, '(vacío)') AS ups,
  product.status,
  COALESCE(product.is_deleted, false) AS is_deleted,
  COUNT(*) AS product_rows,
  COALESCE(SUM(product.quantity), 0) AS total_units,
  COALESCE(SUM(product.available_qty), 0) AS available_units,
  COALESCE(SUM(product.sold_qty), 0) AS sold_units,
  COALESCE(SUM(product.donated_qty), 0) AS donated_units,
  COALESCE(SUM(product.lost_qty), 0) AS lost_units,
  COALESCE(SUM(product.expired_qty), 0) AS expired_units
FROM public.products product
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;

-- 2. Historical/accounting invariants. Save this one-row result and compare it
-- exactly before and after the migration.
SELECT
  (SELECT COUNT(*) FROM public.transactions) AS transaction_rows,
  (SELECT COALESCE(SUM(total), 0) FROM public.transactions) AS transaction_total,
  (SELECT COALESCE(SUM(
      COALESCE(cash_amount, 0) + COALESCE(transfer_amount, 0) + COALESCE(card_amount, 0)
    ), 0)
     FROM public.transactions) AS recorded_payments,
  (SELECT COUNT(*) FROM public.transaction_items) AS transaction_item_rows,
  (SELECT COALESCE(SUM(total_price), 0) FROM public.transaction_items) AS transaction_item_total,
  (SELECT COUNT(*) FROM public.customers) AS customer_rows,
  (SELECT COALESCE(SUM(balance), 0) FROM public.customers) AS customer_balance,
  (SELECT COALESCE(SUM(total_purchases), 0) FROM public.customers) AS customer_total_purchases,
  (SELECT COUNT(*) FROM public.sale_edit_audit) AS sale_edit_audit_rows;

-- 3. Historical sale lines related to inventory that migration 030 will hide.
SELECT
  COALESCE(NULLIF(BTRIM(product.drop_number), ''), product.ups_batch::text, '(vacío)') AS ups,
  COUNT(DISTINCT item.transaction_id) AS related_sales,
  COUNT(*) AS related_sale_lines,
  COALESCE(SUM(item.quantity), 0) AS related_units,
  COALESCE(SUM(item.total_price), 0) AS related_sales_value
FROM public.transaction_items item
JOIN public.products product ON product.id = item.product_id
WHERE NOT (
  product.drop_number IN ('23', '24', '25')
  AND product.ups_batch IN (23, 24, 25)
  AND product.drop_number = product.ups_batch::text
)
GROUP BY 1
ORDER BY 1;

-- 4. Post-migration checks. This block is safe to run before migration 030:
-- it reports PENDING instead of failing when the registry does not exist.
CREATE TEMP TABLE IF NOT EXISTS ups_030_postcheck (
  migration_status text NOT NULL,
  allowed_ups integer[],
  invalid_active_products bigint,
  invalid_active_drops bigint
);

TRUNCATE pg_temp.ups_030_postcheck;

DO $postcheck$
BEGIN
  IF to_regclass('public.allowed_inventory_ups') IS NULL THEN
    INSERT INTO pg_temp.ups_030_postcheck (migration_status)
    VALUES ('PENDING: apply migration 030 before evaluating these checks');
  ELSE
    EXECUTE $query$
      INSERT INTO pg_temp.ups_030_postcheck (
        migration_status,
        allowed_ups,
        invalid_active_products,
        invalid_active_drops
      )
      SELECT
        'APPLIED',
        (SELECT ARRAY_AGG(ups_number ORDER BY ups_number)
         FROM public.allowed_inventory_ups),
        (SELECT COUNT(*)
         FROM public.products product
         WHERE COALESCE(product.is_deleted, false) = false
           AND NOT EXISTS (
             SELECT 1
             FROM public.allowed_inventory_ups allowed
             WHERE product.drop_number = allowed.ups_number::text
               AND product.ups_batch = allowed.ups_number
           )),
        (SELECT COUNT(*)
         FROM public.drops drop_row
         WHERE COALESCE(drop_row.is_deleted, false) = false
           AND NOT EXISTS (
             SELECT 1
             FROM public.allowed_inventory_ups allowed
             WHERE drop_row.drop_number = allowed.ups_number::text
           ));
    $query$;
  END IF;
END;
$postcheck$;

SELECT * FROM pg_temp.ups_030_postcheck;
