-- Atomically edit every administrative detail of an existing sale.
-- The legacy modify/refund RPCs remain available for older deployed clients.

CREATE OR REPLACE FUNCTION public.edit_sale_transaction_details(edit_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_transaction_id text := NULLIF(BTRIM(edit_payload->>'transactionId'), '');
  requested_date timestamptz;
  requested_notes text;
  requested_total numeric;
  requested_cash numeric;
  requested_transfer numeric;
  requested_card numeric;
  requested_paid numeric;
  tx_record public.transactions%ROWTYPE;
  current_item jsonb;
  current_ordinality bigint;
  line_product_id text;
  line_product_name text;
  line_quantity integer;
  line_unit_price numeric;
  line_sat_key_id text;
  canonical_sat_code text;
  canonical_sat_description text;
  discount_value numeric;
  target_subtotal numeric;
  weight_total numeric;
  allocated_before_last numeric;
  last_line_no bigint;
  old_total numeric;
  old_paid numeric;
  old_unpaid numeric;
  new_unpaid numeric;
  delta_unpaid numeric;
  effective_payment_method text;
  nonzero_payment_count integer;
  inventory_changed boolean := false;
  delta_record record;
  result_item_count integer;
BEGIN
  IF target_transaction_id IS NULL THEN
    RAISE EXCEPTION 'edit_sale_transaction_details_requires_transaction_id';
  END IF;

  -- Serialize concurrent edits (including retries) before reading any dependent rows.
  PERFORM pg_advisory_xact_lock(hashtextextended(target_transaction_id, 0));

  SELECT *
  INTO tx_record
  FROM public.transactions
  WHERE id = target_transaction_id
    AND COALESCE(is_deleted, false) = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'transaction_not_found';
  END IF;

  IF tx_record.type <> 'sale' THEN
    RAISE EXCEPTION 'transaction_not_sale';
  END IF;

  IF jsonb_typeof(edit_payload->'items') IS DISTINCT FROM 'array'
    OR jsonb_array_length(COALESCE(edit_payload->'items', '[]'::jsonb)) = 0
  THEN
    RAISE EXCEPTION 'transaction_requires_at_least_one_item';
  END IF;

  BEGIN
    requested_date := NULLIF(edit_payload->>'date', '')::timestamptz;
    requested_total := COALESCE((edit_payload->>'total')::numeric, -1);
    requested_cash := COALESCE((edit_payload->>'cashAmount')::numeric, -1);
    requested_transfer := COALESCE((edit_payload->>'transferAmount')::numeric, -1);
    requested_card := COALESCE((edit_payload->>'cardAmount')::numeric, -1);
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'invalid_sale_edit_payload';
  END;

  IF requested_date IS NULL THEN
    RAISE EXCEPTION 'sale_date_required';
  END IF;

  IF requested_total < 0
    OR requested_cash < 0
    OR requested_transfer < 0
    OR requested_card < 0
  THEN
    RAISE EXCEPTION 'sale_amounts_must_be_non_negative';
  END IF;

  requested_total := ROUND(requested_total, 2);
  requested_cash := ROUND(requested_cash, 2);
  requested_transfer := ROUND(requested_transfer, 2);
  requested_card := ROUND(requested_card, 2);
  requested_paid := requested_cash + requested_transfer + requested_card;

  IF requested_paid > requested_total THEN
    RAISE EXCEPTION 'payment_exceeds_sale_total';
  END IF;

  new_unpaid := GREATEST(requested_total - requested_paid, 0);
  IF new_unpaid > 0 AND tx_record.customer_id IS NULL THEN
    RAISE EXCEPTION 'credit_requires_registered_customer';
  END IF;

  requested_notes := NULLIF(BTRIM(COALESCE(edit_payload->>'notes', '')), '');
  discount_value := ROUND(COALESCE(tx_record.discount, 0), 2);
  target_subtotal := requested_total + discount_value;

  IF discount_value < 0 OR target_subtotal < 0 THEN
    RAISE EXCEPTION 'invalid_historical_discount';
  END IF;

  CREATE TEMP TABLE tmp_edit_sale_items (
    line_no bigint PRIMARY KEY,
    product_id text,
    product_name text NOT NULL,
    quantity integer NOT NULL CHECK (quantity > 0),
    source_unit_price numeric NOT NULL CHECK (source_unit_price >= 0),
    allocation_weight numeric NOT NULL DEFAULT 0,
    unit_price numeric NOT NULL DEFAULT 0,
    total_price numeric NOT NULL DEFAULT 0,
    sat_key_id text,
    sat_key_code text,
    sat_key_description text,
    category text,
    brand text,
    color text,
    size text
  ) ON COMMIT DROP;

  FOR current_item, current_ordinality IN
    SELECT value, ordinality
    FROM jsonb_array_elements(edit_payload->'items') WITH ORDINALITY
  LOOP
    line_product_id := NULLIF(BTRIM(current_item->>'productId'), '');
    line_product_name := NULLIF(BTRIM(current_item->>'productName'), '');

    BEGIN
      line_quantity := COALESCE((current_item->>'quantity')::integer, 0);
      line_unit_price := COALESCE((current_item->>'unitPrice')::numeric, -1);
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'invalid_sale_item_amount';
    END;

    IF line_product_name IS NULL THEN
      RAISE EXCEPTION 'item_missing_product_name';
    END IF;

    IF line_quantity <= 0 THEN
      RAISE EXCEPTION 'item_quantity_invalid';
    END IF;

    IF line_unit_price < 0 THEN
      RAISE EXCEPTION 'item_unit_price_invalid';
    END IF;

    line_sat_key_id := NULLIF(BTRIM(current_item->>'satKeyId'), '');
    canonical_sat_code := NULL;
    canonical_sat_description := NULL;

    IF line_sat_key_id IS NOT NULL THEN
      SELECT BTRIM(code), BTRIM(description)
      INTO canonical_sat_code, canonical_sat_description
      FROM public.sat_keys
      WHERE id = line_sat_key_id
        AND COALESCE(is_deleted, false) = false;

      IF NOT FOUND THEN
        -- An unavailable historical snapshot may remain only when it can be
        -- proven to be identical to a snapshot already stored on this sale.
        SELECT ti.sat_key_code, ti.sat_key_description
        INTO canonical_sat_code, canonical_sat_description
        FROM public.transaction_items ti
        WHERE ti.transaction_id = target_transaction_id
          AND ti.product_id IS NOT DISTINCT FROM line_product_id
          AND ti.sat_key_id = line_sat_key_id
        ORDER BY ti.id
        LIMIT 1;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'sat_key_not_active:%', line_sat_key_id;
        END IF;
      END IF;
    END IF;

    INSERT INTO tmp_edit_sale_items (
      line_no, product_id, product_name, quantity, source_unit_price,
      allocation_weight, sat_key_id, sat_key_code, sat_key_description,
      category, brand, color, size
    ) VALUES (
      current_ordinality,
      line_product_id,
      line_product_name,
      line_quantity,
      line_unit_price,
      line_quantity * line_unit_price,
      line_sat_key_id,
      canonical_sat_code,
      canonical_sat_description,
      NULLIF(BTRIM(current_item->>'category'), ''),
      NULLIF(BTRIM(current_item->>'brand'), ''),
      NULLIF(BTRIM(current_item->>'color'), ''),
      NULLIF(BTRIM(current_item->>'size'), '')
    );
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM (SELECT DISTINCT product_id FROM tmp_edit_sale_items WHERE product_id IS NOT NULL) requested
    LEFT JOIN public.products p
      ON p.id = requested.product_id
      AND COALESCE(p.is_deleted, false) = false
    WHERE p.id IS NULL
  ) THEN
    RAISE EXCEPTION 'product_not_found';
  END IF;

  -- Lock every old/new product in a stable order before calculating deltas.
  PERFORM p.id
  FROM public.products p
  JOIN (
    SELECT product_id FROM public.transaction_items
      WHERE transaction_id = target_transaction_id AND product_id IS NOT NULL
    UNION
    SELECT product_id FROM tmp_edit_sale_items WHERE product_id IS NOT NULL
  ) affected ON affected.product_id = p.id
  ORDER BY p.id
  FOR UPDATE OF p;

  SELECT COALESCE(SUM(allocation_weight), 0), MAX(line_no)
  INTO weight_total, last_line_no
  FROM tmp_edit_sale_items;

  IF weight_total <= 0 THEN
    UPDATE tmp_edit_sale_items SET allocation_weight = quantity;
    SELECT COALESCE(SUM(allocation_weight), 0) INTO weight_total FROM tmp_edit_sale_items;
  END IF;

  UPDATE tmp_edit_sale_items
  SET total_price = FLOOR(target_subtotal * 100 * allocation_weight / weight_total) / 100
  WHERE line_no <> last_line_no;

  SELECT COALESCE(SUM(total_price), 0)
  INTO allocated_before_last
  FROM tmp_edit_sale_items
  WHERE line_no <> last_line_no;

  UPDATE tmp_edit_sale_items
  SET total_price = ROUND(target_subtotal - allocated_before_last, 2)
  WHERE line_no = last_line_no;

  UPDATE tmp_edit_sale_items
  SET unit_price = ROUND(total_price / quantity, 2);

  FOR delta_record IN
    WITH old_qty AS (
      SELECT product_id, SUM(quantity)::integer AS qty
      FROM public.transaction_items
      WHERE transaction_id = target_transaction_id AND product_id IS NOT NULL
      GROUP BY product_id
    ),
    new_qty AS (
      SELECT product_id, SUM(quantity)::integer AS qty
      FROM tmp_edit_sale_items
      WHERE product_id IS NOT NULL
      GROUP BY product_id
    )
    SELECT
      COALESCE(new_qty.product_id, old_qty.product_id) AS product_id,
      COALESCE(new_qty.qty, 0) - COALESCE(old_qty.qty, 0) AS qty_delta
    FROM old_qty
    FULL OUTER JOIN new_qty ON new_qty.product_id = old_qty.product_id
    WHERE COALESCE(new_qty.qty, 0) <> COALESCE(old_qty.qty, 0)
    ORDER BY COALESCE(new_qty.product_id, old_qty.product_id)
  LOOP
    inventory_changed := true;

    IF delta_record.qty_delta > 0 THEN
      UPDATE public.products p
      SET
        available_qty = p.available_qty - delta_record.qty_delta,
        sold_qty = p.sold_qty + delta_record.qty_delta,
        sold_to = tx_record.customer_id,
        sold_at = COALESCE(p.sold_at, requested_date),
        updated_at = NOW(),
        status = CASE
          WHEN p.available_qty - delta_record.qty_delta > 0 THEN 'available'
          WHEN p.sold_qty + delta_record.qty_delta > 0 THEN 'sold'
          WHEN p.donated_qty > 0 THEN 'donated'
          WHEN p.lost_qty > 0 THEN 'lost'
          WHEN p.expired_qty > 0 THEN 'expired'
          ELSE 'available'
        END
      WHERE p.id = delta_record.product_id
        AND COALESCE(p.is_deleted, false) = false
        AND p.available_qty >= delta_record.qty_delta;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'insufficient_stock:%', delta_record.product_id;
      END IF;
    ELSE
      UPDATE public.products p
      SET
        available_qty = p.available_qty + ABS(delta_record.qty_delta),
        sold_qty = p.sold_qty - ABS(delta_record.qty_delta),
        sold_to = CASE WHEN p.sold_qty - ABS(delta_record.qty_delta) > 0 THEN p.sold_to END,
        sold_at = CASE WHEN p.sold_qty - ABS(delta_record.qty_delta) > 0 THEN p.sold_at END,
        updated_at = NOW(),
        status = CASE
          WHEN p.available_qty + ABS(delta_record.qty_delta) > 0 THEN 'available'
          WHEN p.sold_qty - ABS(delta_record.qty_delta) > 0 THEN 'sold'
          WHEN p.donated_qty > 0 THEN 'donated'
          WHEN p.lost_qty > 0 THEN 'lost'
          WHEN p.expired_qty > 0 THEN 'expired'
          ELSE 'available'
        END
      WHERE p.id = delta_record.product_id
        AND COALESCE(p.is_deleted, false) = false
        AND p.sold_qty >= ABS(delta_record.qty_delta);

      IF NOT FOUND THEN
        RAISE EXCEPTION 'sold_qty_underflow:%', delta_record.product_id;
      END IF;
    END IF;
  END LOOP;

  old_total := ROUND(COALESCE(tx_record.total, 0), 2);
  old_paid := ROUND(
    COALESCE(tx_record.cash_amount, 0) +
    COALESCE(tx_record.transfer_amount, 0) +
    COALESCE(tx_record.card_amount, 0),
    2
  );
  old_unpaid := GREATEST(old_total - old_paid, 0);
  delta_unpaid := new_unpaid - old_unpaid;

  nonzero_payment_count :=
    (CASE WHEN requested_cash > 0 THEN 1 ELSE 0 END) +
    (CASE WHEN requested_transfer > 0 THEN 1 ELSE 0 END) +
    (CASE WHEN requested_card > 0 THEN 1 ELSE 0 END);

  effective_payment_method := CASE
    WHEN nonzero_payment_count > 1 THEN 'mixed'
    WHEN new_unpaid > 0 THEN 'credit'
    WHEN requested_cash > 0 THEN 'cash'
    WHEN requested_transfer > 0 THEN 'transfer'
    WHEN requested_card > 0 THEN 'card'
    ELSE 'credit'
  END;

  DELETE FROM public.transaction_items WHERE transaction_id = target_transaction_id;

  INSERT INTO public.transaction_items (
    transaction_id, product_id, product_name, quantity, unit_price, total_price,
    sat_key_id, sat_key_code, sat_key_description, category, brand, color, size
  )
  SELECT
    target_transaction_id, product_id, product_name, quantity, unit_price, total_price,
    sat_key_id, sat_key_code, sat_key_description, category, brand, color, size
  FROM tmp_edit_sale_items
  ORDER BY line_no;

  UPDATE public.transactions
  SET
    subtotal = target_subtotal,
    total = requested_total,
    payment_method = effective_payment_method,
    cash_amount = requested_cash,
    transfer_amount = requested_transfer,
    card_amount = requested_card,
    actual_card_amount = CASE
      WHEN requested_card <= 0 THEN NULL
      WHEN requested_card = COALESCE(tx_record.card_amount, 0) THEN tx_record.actual_card_amount
      ELSE NULL
    END,
    is_installment = new_unpaid > 0,
    installment_amount = NULL,
    remaining_balance = CASE WHEN new_unpaid > 0 THEN new_unpaid ELSE NULL END,
    notes = requested_notes,
    date = requested_date
  WHERE id = target_transaction_id;

  IF tx_record.customer_id IS NOT NULL AND delta_unpaid <> 0 THEN
    UPDATE public.customers
    SET
      balance = GREATEST(0, COALESCE(balance, 0) + delta_unpaid),
      total_purchases = GREATEST(0, COALESCE(total_purchases, 0) + delta_unpaid),
      updated_at = NOW()
    WHERE id = tx_record.customer_id
      AND COALESCE(is_deleted, false) = false;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'customer_not_found:%', tx_record.customer_id;
    END IF;
  END IF;

  SELECT COUNT(*) INTO result_item_count FROM tmp_edit_sale_items;

  RETURN jsonb_build_object(
    'transactionId', target_transaction_id,
    'oldTotal', old_total,
    'newTotal', requested_total,
    'oldPaidAmount', old_paid,
    'paidAmount', requested_paid,
    'cashAmount', requested_cash,
    'transferAmount', requested_transfer,
    'cardAmount', requested_card,
    'oldUnpaid', old_unpaid,
    'newUnpaid', new_unpaid,
    'deltaUnpaid', delta_unpaid,
    'paymentMethod', effective_payment_method,
    'inventoryChanged', inventory_changed,
    'itemCount', result_item_count,
    'date', requested_date
  );
END;
$$;

REVOKE ALL ON FUNCTION public.edit_sale_transaction_details(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edit_sale_transaction_details(jsonb) TO authenticated;
