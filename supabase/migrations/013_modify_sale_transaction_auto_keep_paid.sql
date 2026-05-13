-- Extend modify_sale_transaction with optional auto-settlement for originally paid sales.
-- Keeps inventory/customer updates atomic while allowing "keep fully paid" edits.

CREATE OR REPLACE FUNCTION modify_sale_transaction(edit_payload jsonb)
RETURNS jsonb AS $$
DECLARE
  target_transaction_id TEXT := NULLIF(edit_payload->>'transactionId', '');
  auto_keep_paid_if_fully_paid BOOLEAN := COALESCE((edit_payload->>'autoKeepPaidIfFullyPaid')::boolean, false);
  pending_epsilon NUMERIC := 0.01;
  tx_record transactions%ROWTYPE;
  current_item jsonb;
  delta_record record;
  line_product_id TEXT;
  line_product_name TEXT;
  line_quantity INTEGER;
  line_unit_price NUMERIC;
  line_total_price NUMERIC;
  line_category TEXT;
  line_brand TEXT;
  line_color TEXT;
  line_size TEXT;
  original_unregistered_qty INTEGER;
  discount_value NUMERIC;
  old_total NUMERIC;
  new_subtotal NUMERIC;
  new_total NUMERIC;
  old_paid_amount NUMERIC;
  old_unpaid NUMERIC;
  effective_cash_amount NUMERIC;
  effective_transfer_amount NUMERIC;
  effective_card_amount NUMERIC;
  effective_paid_amount NUMERIC;
  new_unpaid NUMERIC;
  delta_unpaid NUMERIC;
  auto_settlement_applied BOOLEAN := false;
  auto_settlement_delta NUMERIC := 0;
  auto_settlement_method TEXT := NULL;
  updated_row_count INTEGER;
BEGIN
  IF target_transaction_id IS NULL THEN
    RAISE EXCEPTION 'modify_sale_transaction requires transactionId';
  END IF;

  SELECT *
  INTO tx_record
  FROM transactions
  WHERE id = target_transaction_id
    AND COALESCE(is_deleted, false) = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'transaction_not_found';
  END IF;

  IF tx_record.type <> 'sale' THEN
    RAISE EXCEPTION 'transaction_not_sale';
  END IF;

  IF jsonb_typeof(edit_payload->'items') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid_items_payload';
  END IF;

  IF jsonb_array_length(COALESCE(edit_payload->'items', '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'transaction_requires_at_least_one_item';
  END IF;

  DROP TABLE IF EXISTS tmp_modify_sale_items;

  CREATE TEMP TABLE tmp_modify_sale_items (
    product_id TEXT,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC NOT NULL CHECK (unit_price >= 0),
    total_price NUMERIC NOT NULL CHECK (total_price >= 0),
    category TEXT,
    brand TEXT,
    color TEXT,
    size TEXT
  ) ON COMMIT DROP;

  FOR current_item IN
    SELECT value
    FROM jsonb_array_elements(edit_payload->'items')
  LOOP
    line_product_id := NULLIF(current_item->>'productId', '');
    line_product_name := COALESCE(NULLIF(current_item->>'productName', ''), '');
    line_quantity := COALESCE((current_item->>'quantity')::integer, 0);
    line_unit_price := COALESCE((current_item->>'unitPrice')::numeric, 0);
    line_total_price := line_quantity * line_unit_price;
    line_category := NULLIF(current_item->>'category', '');
    line_brand := NULLIF(current_item->>'brand', '');
    line_color := NULLIF(current_item->>'color', '');
    line_size := NULLIF(current_item->>'size', '');

    IF line_product_name = '' THEN
      RAISE EXCEPTION 'item_missing_product_name';
    END IF;

    IF line_quantity <= 0 THEN
      RAISE EXCEPTION 'item_quantity_invalid';
    END IF;

    IF line_unit_price < 0 THEN
      RAISE EXCEPTION 'item_unit_price_invalid';
    END IF;

    IF line_product_id IS NULL THEN
      -- Existing unregistered lines may remain or be removed, but cannot be added or have quantity changed.
      SELECT ti.quantity
      INTO original_unregistered_qty
      FROM transaction_items ti
      WHERE ti.transaction_id = target_transaction_id
        AND ti.product_id IS NULL
        AND ti.product_name = line_product_name
        AND ti.unit_price = line_unit_price
      LIMIT 1;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'unregistered_item_add_not_allowed';
      END IF;

      IF line_quantity <> original_unregistered_qty THEN
        RAISE EXCEPTION 'unregistered_item_quantity_immutable';
      END IF;
    END IF;

    INSERT INTO tmp_modify_sale_items (
      product_id,
      product_name,
      quantity,
      unit_price,
      total_price,
      category,
      brand,
      color,
      size
    ) VALUES (
      line_product_id,
      line_product_name,
      line_quantity,
      line_unit_price,
      line_total_price,
      line_category,
      line_brand,
      line_color,
      line_size
    );
  END LOOP;

  -- Validate all referenced registered products exist and are active.
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT DISTINCT product_id
      FROM tmp_modify_sale_items
      WHERE product_id IS NOT NULL
    ) ni
    LEFT JOIN products p ON p.id = ni.product_id AND COALESCE(p.is_deleted, false) = false
    WHERE p.id IS NULL
  ) THEN
    RAISE EXCEPTION 'product_not_found';
  END IF;

  -- Compute quantity deltas by product and apply stock movement atomically.
  FOR delta_record IN
    WITH old_qty AS (
      SELECT product_id, SUM(quantity)::integer AS qty
      FROM transaction_items
      WHERE transaction_id = target_transaction_id
        AND product_id IS NOT NULL
      GROUP BY product_id
    ),
    new_qty AS (
      SELECT product_id, SUM(quantity)::integer AS qty
      FROM tmp_modify_sale_items
      WHERE product_id IS NOT NULL
      GROUP BY product_id
    )
    SELECT
      COALESCE(new_qty.product_id, old_qty.product_id) AS product_id,
      COALESCE(new_qty.qty, 0) - COALESCE(old_qty.qty, 0) AS qty_delta
    FROM old_qty
    FULL OUTER JOIN new_qty ON new_qty.product_id = old_qty.product_id
    WHERE COALESCE(new_qty.qty, 0) <> COALESCE(old_qty.qty, 0)
  LOOP
    IF delta_record.qty_delta > 0 THEN
      UPDATE products p
      SET
        available_qty = p.available_qty - delta_record.qty_delta,
        sold_qty = p.sold_qty + delta_record.qty_delta,
        sold_to = CASE
          WHEN (p.sold_qty + delta_record.qty_delta) > 0 THEN tx_record.customer_id
          ELSE NULL
        END,
        sold_at = CASE
          WHEN (p.sold_qty + delta_record.qty_delta) > 0 THEN COALESCE(p.sold_at, tx_record.date)
          ELSE NULL
        END,
        updated_at = NOW(),
        status = CASE
          WHEN p.quantity - (
            (p.available_qty - delta_record.qty_delta) +
            (p.sold_qty + delta_record.qty_delta) +
            p.donated_qty +
            p.lost_qty +
            p.expired_qty
          ) > 0 THEN 'review'
          WHEN (p.available_qty - delta_record.qty_delta) > 0 THEN 'available'
          WHEN (p.sold_qty + delta_record.qty_delta) > 0 THEN 'sold'
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
      UPDATE products p
      SET
        available_qty = p.available_qty + ABS(delta_record.qty_delta),
        sold_qty = p.sold_qty - ABS(delta_record.qty_delta),
        sold_to = CASE
          WHEN (p.sold_qty - ABS(delta_record.qty_delta)) > 0 THEN p.sold_to
          ELSE NULL
        END,
        sold_at = CASE
          WHEN (p.sold_qty - ABS(delta_record.qty_delta)) > 0 THEN p.sold_at
          ELSE NULL
        END,
        updated_at = NOW(),
        status = CASE
          WHEN p.quantity - (
            (p.available_qty + ABS(delta_record.qty_delta)) +
            (p.sold_qty - ABS(delta_record.qty_delta)) +
            p.donated_qty +
            p.lost_qty +
            p.expired_qty
          ) > 0 THEN 'review'
          WHEN (p.available_qty + ABS(delta_record.qty_delta)) > 0 THEN 'available'
          WHEN (p.sold_qty - ABS(delta_record.qty_delta)) > 0 THEN 'sold'
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

  DELETE FROM transaction_items
  WHERE transaction_id = target_transaction_id;

  INSERT INTO transaction_items (
    transaction_id,
    product_id,
    product_name,
    quantity,
    unit_price,
    total_price,
    category,
    brand,
    color,
    size
  )
  SELECT
    target_transaction_id,
    product_id,
    product_name,
    quantity,
    unit_price,
    total_price,
    category,
    brand,
    color,
    size
  FROM tmp_modify_sale_items;

  SELECT COALESCE(SUM(total_price), 0)
  INTO new_subtotal
  FROM tmp_modify_sale_items;

  discount_value := COALESCE((edit_payload->>'discount')::numeric, tx_record.discount, 0);
  IF discount_value < 0 THEN
    RAISE EXCEPTION 'discount_invalid';
  END IF;

  new_total := new_subtotal - discount_value;
  IF new_total < 0 THEN
    RAISE EXCEPTION 'total_invalid';
  END IF;

  old_total := COALESCE(tx_record.total, 0);
  old_paid_amount :=
    COALESCE(tx_record.cash_amount, 0) +
    COALESCE(tx_record.transfer_amount, 0) +
    COALESCE(tx_record.card_amount, 0);
  old_unpaid := GREATEST(old_total - old_paid_amount, 0);

  effective_cash_amount := COALESCE(tx_record.cash_amount, 0);
  effective_transfer_amount := COALESCE(tx_record.transfer_amount, 0);
  effective_card_amount := COALESCE(tx_record.card_amount, 0);
  effective_paid_amount :=
    effective_cash_amount + effective_transfer_amount + effective_card_amount;

  IF auto_keep_paid_if_fully_paid
    AND old_unpaid <= pending_epsilon
    AND new_total > effective_paid_amount
  THEN
    auto_settlement_delta := new_total - effective_paid_amount;

    IF effective_cash_amount >= effective_transfer_amount
      AND effective_cash_amount >= effective_card_amount
    THEN
      auto_settlement_method := 'cash';
      effective_cash_amount := effective_cash_amount + auto_settlement_delta;
    ELSIF effective_transfer_amount >= effective_cash_amount
      AND effective_transfer_amount >= effective_card_amount
    THEN
      auto_settlement_method := 'transfer';
      effective_transfer_amount := effective_transfer_amount + auto_settlement_delta;
    ELSIF effective_card_amount >= effective_cash_amount
      AND effective_card_amount >= effective_transfer_amount
    THEN
      auto_settlement_method := 'card';
      effective_card_amount := effective_card_amount + auto_settlement_delta;
    ELSE
      auto_settlement_method := 'cash';
      effective_cash_amount := effective_cash_amount + auto_settlement_delta;
    END IF;

    effective_paid_amount :=
      effective_cash_amount + effective_transfer_amount + effective_card_amount;
    auto_settlement_applied := true;
  END IF;

  IF new_total < effective_paid_amount THEN
    RAISE EXCEPTION 'paid_floor_violation';
  END IF;

  UPDATE transactions
  SET
    subtotal = new_subtotal,
    discount = discount_value,
    discount_note = CASE
      WHEN edit_payload ? 'discountNote' THEN NULLIF(edit_payload->>'discountNote', '')
      ELSE tx_record.discount_note
    END,
    total = new_total,
    cash_amount = effective_cash_amount,
    transfer_amount = effective_transfer_amount,
    card_amount = effective_card_amount,
    notes = CASE
      WHEN edit_payload ? 'notes' THEN NULLIF(edit_payload->>'notes', '')
      ELSE tx_record.notes
    END,
    date = CASE
      WHEN edit_payload ? 'date' THEN COALESCE(NULLIF(edit_payload->>'date', '')::timestamptz, tx_record.date)
      ELSE tx_record.date
    END,
    payment_date = CASE
      WHEN edit_payload ? 'paymentDate' THEN NULLIF(edit_payload->>'paymentDate', '')::timestamptz
      ELSE tx_record.payment_date
    END
  WHERE id = target_transaction_id;

  new_unpaid := GREATEST(new_total - effective_paid_amount, 0);
  delta_unpaid := new_unpaid - old_unpaid;

  IF tx_record.customer_id IS NOT NULL AND delta_unpaid <> 0 THEN
    UPDATE customers
    SET
      balance = GREATEST(0, balance + delta_unpaid),
      total_purchases = GREATEST(0, total_purchases + delta_unpaid),
      updated_at = NOW()
    WHERE id = tx_record.customer_id
      AND COALESCE(is_deleted, false) = false;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'customer_not_found:%', tx_record.customer_id;
    END IF;
  END IF;

  SELECT COUNT(*) INTO updated_row_count FROM tmp_modify_sale_items;

  RETURN jsonb_build_object(
    'transactionId', target_transaction_id,
    'oldTotal', old_total,
    'newTotal', new_total,
    'oldPaidAmount', old_paid_amount,
    'paidAmount', effective_paid_amount,
    'cashAmount', effective_cash_amount,
    'transferAmount', effective_transfer_amount,
    'cardAmount', effective_card_amount,
    'oldUnpaid', old_unpaid,
    'newUnpaid', new_unpaid,
    'deltaUnpaid', delta_unpaid,
    'autoSettlementApplied', auto_settlement_applied,
    'autoSettlementDelta', auto_settlement_delta,
    'autoSettlementMethod', auto_settlement_method,
    'itemCount', updated_row_count
  );
END;
$$ LANGUAGE plpgsql;
