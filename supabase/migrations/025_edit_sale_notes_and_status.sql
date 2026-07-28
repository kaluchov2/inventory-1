-- Preserve editable sale comments across both edit branches and prevent stock
-- changes made by sale edits/refunds from leaving affected products in review.
--
-- The existing RPCs remain the source of truth for inventory and customer
-- balance calculations. These wrappers run in the same PostgreSQL transaction.

CREATE OR REPLACE FUNCTION public.sale_edit_changed_product_ids(edit_payload jsonb)
RETURNS text[] AS $$
  WITH old_qty AS (
    SELECT
      product_id,
      SUM(quantity)::integer AS qty
    FROM public.transaction_items
    WHERE transaction_id = NULLIF(edit_payload->>'transactionId', '')
      AND product_id IS NOT NULL
    GROUP BY product_id
  ),
  new_qty AS (
    SELECT
      NULLIF(item->>'productId', '') AS product_id,
      SUM(COALESCE((item->>'quantity')::integer, 0))::integer AS qty
    FROM jsonb_array_elements(COALESCE(edit_payload->'items', '[]'::jsonb)) AS item
    WHERE NULLIF(item->>'productId', '') IS NOT NULL
    GROUP BY NULLIF(item->>'productId', '')
  ),
  changed AS (
    SELECT COALESCE(new_qty.product_id, old_qty.product_id) AS product_id
    FROM old_qty
    FULL OUTER JOIN new_qty ON new_qty.product_id = old_qty.product_id
    WHERE COALESCE(new_qty.qty, 0) <> COALESCE(old_qty.qty, 0)
  )
  SELECT COALESCE(
    ARRAY_AGG(product_id ORDER BY product_id),
    ARRAY[]::text[]
  )
  FROM changed;
$$ LANGUAGE sql STABLE;

ALTER FUNCTION public.modify_sale_transaction(jsonb)
  RENAME TO modify_sale_transaction_inventory_base_v024;

CREATE OR REPLACE FUNCTION public.modify_sale_transaction(edit_payload jsonb)
RETURNS jsonb AS $$
DECLARE
  changed_product_ids text[] :=
    public.sale_edit_changed_product_ids(edit_payload);
  result jsonb;
BEGIN
  result :=
    public.modify_sale_transaction_inventory_base_v024(edit_payload);

  IF CARDINALITY(changed_product_ids) > 0 THEN
    UPDATE public.products
    SET status = CASE
      WHEN available_qty > 0 THEN 'available'
      WHEN sold_qty > 0 THEN 'sold'
      WHEN donated_qty > 0 THEN 'donated'
      WHEN lost_qty > 0 THEN 'lost'
      WHEN expired_qty > 0 THEN 'expired'
      ELSE 'available'
    END
    WHERE id = ANY(changed_product_ids)
      AND COALESCE(is_deleted, false) = false
      AND status = 'review';
  END IF;

  RETURN result;
END;
$$ LANGUAGE plpgsql;

ALTER FUNCTION public.refund_sale_transaction_from_edit(jsonb)
  RENAME TO refund_sale_transaction_from_edit_inventory_base_v024;

CREATE OR REPLACE FUNCTION public.refund_sale_transaction_from_edit(edit_payload jsonb)
RETURNS jsonb AS $$
DECLARE
  target_transaction_id text :=
    NULLIF(edit_payload->>'transactionId', '');
  changed_product_ids text[] :=
    public.sale_edit_changed_product_ids(edit_payload);
  result jsonb;
BEGIN
  result :=
    public.refund_sale_transaction_from_edit_inventory_base_v024(edit_payload);

  IF edit_payload ? 'notes' THEN
    UPDATE public.transactions
    SET notes = NULLIF(BTRIM(edit_payload->>'notes'), '')
    WHERE id = target_transaction_id
      AND COALESCE(is_deleted, false) = false;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'transaction_not_found';
    END IF;
  END IF;

  IF CARDINALITY(changed_product_ids) > 0 THEN
    UPDATE public.products
    SET status = CASE
      WHEN available_qty > 0 THEN 'available'
      WHEN sold_qty > 0 THEN 'sold'
      WHEN donated_qty > 0 THEN 'donated'
      WHEN lost_qty > 0 THEN 'lost'
      WHEN expired_qty > 0 THEN 'expired'
      ELSE 'available'
    END
    WHERE id = ANY(changed_product_ids)
      AND COALESCE(is_deleted, false) = false
      AND status = 'review';
  END IF;

  RETURN result;
END;
$$ LANGUAGE plpgsql;
