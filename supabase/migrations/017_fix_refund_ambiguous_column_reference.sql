-- Hotfix: resolve ambiguous refund_total column reference in refund-from-edit RPC.
-- Reverts inventory for removed quantities and creates a linked return transaction atomically.

CREATE OR REPLACE FUNCTION refund_sale_transaction_from_edit(edit_payload jsonb)
RETURNS jsonb AS $$
DECLARE
  target_transaction_id TEXT := NULLIF(edit_payload->>'transactionId', '');
  return_transaction_id TEXT := NULLIF(edit_payload->>'returnTransactionId', '');
  refund_reason TEXT := NULLIF(edit_payload->>'reason', '');
  tx_record transactions%ROWTYPE;
  current_item jsonb;
  stock_row record;
  line_product_id TEXT;
  line_product_name TEXT;
  line_quantity INTEGER;
  line_unit_price NUMERIC;
  line_total_price NUMERIC;
  line_category TEXT;
  line_brand TEXT;
  line_color TEXT;
  line_size TEXT;
  discount_value NUMERIC;
  edited_subtotal NUMERIC;
  edited_total NUMERIC;
  old_total NUMERIC;
  old_paid NUMERIC;
  old_unpaid NUMERIC;
  new_total NUMERIC;
  new_unpaid NUMERIC;
  delta_unpaid NUMERIC;
  refund_total NUMERIC := 0;
  refunded_item_count INTEGER := 0;
  restored_product_rows INTEGER := 0;
  refundable_paid NUMERIC := 0;
  refund_cash NUMERIC := 0;
  refund_transfer NUMERIC := 0;
  refund_card NUMERIC := 0;
  payment_method_for_return TEXT := 'credit';
  payment_method_count INTEGER := 0;
BEGIN
  IF target_transaction_id IS NULL THEN
    RAISE EXCEPTION 'refund_sale_transaction_from_edit requires transactionId';
  END IF;

  IF return_transaction_id IS NULL THEN
    return_transaction_id := target_transaction_id || '-refund-' ||
      SUBSTRING(MD5(clock_timestamp()::text || random()::text), 1, 12);
  END IF;

  IF refund_reason IS NULL THEN
    refund_reason := 'Refund from Clientes edit flow';
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

  DROP TABLE IF EXISTS tmp_refund_edit_items;
  DROP TABLE IF EXISTS tmp_refund_old_keys;
  DROP TABLE IF EXISTS tmp_refund_new_keys;
  DROP TABLE IF EXISTS tmp_refund_rows;

  CREATE TEMP TABLE tmp_refund_edit_items (
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
    line_product_name := NULLIF(current_item->>'productName', '');
    line_quantity := COALESCE((current_item->>'quantity')::integer, 0);
    line_unit_price := COALESCE((current_item->>'unitPrice')::numeric, 0);
    line_total_price := line_quantity * line_unit_price;
    line_category := NULLIF(current_item->>'category', '');
    line_brand := NULLIF(current_item->>'brand', '');
    line_color := NULLIF(current_item->>'color', '');
    line_size := NULLIF(current_item->>'size', '');

    IF line_product_name IS NULL THEN
      RAISE EXCEPTION 'item_missing_product_name';
    END IF;

    IF line_quantity <= 0 THEN
      RAISE EXCEPTION 'item_quantity_invalid';
    END IF;

    IF line_unit_price < 0 THEN
      RAISE EXCEPTION 'item_unit_price_invalid';
    END IF;

    INSERT INTO tmp_refund_edit_items (
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

  SELECT COALESCE(SUM(total_price), 0)
  INTO edited_subtotal
  FROM tmp_refund_edit_items;

  discount_value := COALESCE((edit_payload->>'discount')::numeric, tx_record.discount, 0);
  IF discount_value < 0 THEN
    RAISE EXCEPTION 'discount_invalid';
  END IF;

  edited_total := edited_subtotal - discount_value;
  IF edited_total < 0 THEN
    RAISE EXCEPTION 'total_invalid';
  END IF;

  old_total := COALESCE(tx_record.total, 0);
  old_paid := COALESCE(tx_record.cash_amount, 0) + COALESCE(tx_record.transfer_amount, 0) + COALESCE(tx_record.card_amount, 0);

  IF edited_total >= old_paid OR edited_total >= old_total THEN
    RAISE EXCEPTION 'refund_not_required';
  END IF;

  CREATE TEMP TABLE tmp_refund_old_keys ON COMMIT DROP AS
  WITH old_registered AS (
    SELECT
      'pid:' || ti.product_id AS item_key,
      ti.product_id AS product_id,
      MAX(ti.product_name) AS product_name,
      SUM(ti.quantity)::INTEGER AS qty,
      SUM(ti.total_price)::NUMERIC AS line_total,
      MAX(ti.category) AS category,
      MAX(ti.brand) AS brand,
      MAX(ti.color) AS color,
      MAX(ti.size) AS size
    FROM transaction_items ti
    WHERE ti.transaction_id = target_transaction_id
      AND ti.product_id IS NOT NULL
    GROUP BY ti.product_id
  ),
  old_unregistered AS (
    SELECT
      'unreg:' || ti.product_name || '|' || (ROUND(ti.unit_price::numeric, 2)::numeric(18,2))::text AS item_key,
      NULL::TEXT AS product_id,
      ti.product_name AS product_name,
      SUM(ti.quantity)::INTEGER AS qty,
      SUM(ti.total_price)::NUMERIC AS line_total,
      MAX(ti.category) AS category,
      MAX(ti.brand) AS brand,
      MAX(ti.color) AS color,
      MAX(ti.size) AS size
    FROM transaction_items ti
    WHERE ti.transaction_id = target_transaction_id
      AND ti.product_id IS NULL
    GROUP BY ti.product_name, ti.unit_price
  )
  SELECT
    item_key,
    product_id,
    product_name,
    qty,
    line_total,
    CASE WHEN qty > 0 THEN line_total / qty ELSE 0 END AS unit_price,
    category,
    brand,
    color,
    size
  FROM (
    SELECT * FROM old_registered
    UNION ALL
    SELECT * FROM old_unregistered
  ) x;

  IF NOT EXISTS (SELECT 1 FROM tmp_refund_old_keys) THEN
    RAISE EXCEPTION 'refund_original_items_not_found';
  END IF;

  CREATE TEMP TABLE tmp_refund_new_keys ON COMMIT DROP AS
  WITH new_registered AS (
    SELECT
      'pid:' || ei.product_id AS item_key,
      ei.product_id AS product_id,
      MAX(ei.product_name) AS product_name,
      SUM(ei.quantity)::INTEGER AS qty,
      SUM(ei.total_price)::NUMERIC AS line_total
    FROM tmp_refund_edit_items ei
    WHERE ei.product_id IS NOT NULL
    GROUP BY ei.product_id
  ),
  new_unregistered AS (
    SELECT
      'unreg:' || ei.product_name || '|' || (ROUND(ei.unit_price::numeric, 2)::numeric(18,2))::text AS item_key,
      NULL::TEXT AS product_id,
      ei.product_name AS product_name,
      SUM(ei.quantity)::INTEGER AS qty,
      SUM(ei.total_price)::NUMERIC AS line_total
    FROM tmp_refund_edit_items ei
    WHERE ei.product_id IS NULL
    GROUP BY ei.product_name, ei.unit_price
  )
  SELECT * FROM (
    SELECT * FROM new_registered
    UNION ALL
    SELECT * FROM new_unregistered
  ) x;

  IF EXISTS (
    SELECT 1
    FROM tmp_refund_new_keys nk
    LEFT JOIN tmp_refund_old_keys ok ON ok.item_key = nk.item_key
    WHERE ok.item_key IS NULL
  ) THEN
    RAISE EXCEPTION 'refund_payload_add_not_allowed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_refund_old_keys ok
    JOIN tmp_refund_new_keys nk ON nk.item_key = ok.item_key
    WHERE nk.qty > ok.qty
  ) THEN
    RAISE EXCEPTION 'refund_payload_increase_not_allowed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM tmp_refund_old_keys ok
    LEFT JOIN tmp_refund_new_keys nk ON nk.item_key = ok.item_key
    WHERE COALESCE(nk.qty, 0) < ok.qty
  ) THEN
    RAISE EXCEPTION 'refund_payload_no_refund_change';
  END IF;

  CREATE TEMP TABLE tmp_refund_rows ON COMMIT DROP AS
  SELECT
    ok.item_key,
    ok.product_id,
    ok.product_name,
    (ok.qty - COALESCE(nk.qty, 0))::INTEGER AS refund_qty,
    (ok.line_total - COALESCE(nk.line_total, 0))::NUMERIC AS refund_total,
    ok.category,
    ok.brand,
    ok.color,
    ok.size
  FROM tmp_refund_old_keys ok
  LEFT JOIN tmp_refund_new_keys nk ON nk.item_key = ok.item_key
  WHERE ok.qty > COALESCE(nk.qty, 0);

  IF EXISTS (
    SELECT 1
    FROM tmp_refund_rows fr
    WHERE fr.refund_qty <= 0
      OR fr.refund_total <= 0
  ) THEN
    RAISE EXCEPTION 'refund_payload_invalid_totals';
  END IF;

  SELECT
    COALESCE(SUM(fr.refund_total), 0),
    COUNT(*)
  INTO refund_total, refunded_item_count
  FROM tmp_refund_rows fr;

  IF refund_total <= 0 OR refunded_item_count = 0 THEN
    RAISE EXCEPTION 'refund_total_invalid';
  END IF;

  old_unpaid := GREATEST(old_total - old_paid, 0);
  new_total := old_total - refund_total;
  new_unpaid := GREATEST(new_total - old_paid, 0);
  delta_unpaid := new_unpaid - old_unpaid;

  refundable_paid := LEAST(old_paid, GREATEST(refund_total - old_unpaid, 0));
  refund_cash := LEAST(COALESCE(tx_record.cash_amount, 0), refundable_paid);
  refund_transfer := LEAST(COALESCE(tx_record.transfer_amount, 0), GREATEST(refundable_paid - refund_cash, 0));
  refund_card := LEAST(COALESCE(tx_record.card_amount, 0), GREATEST(refundable_paid - refund_cash - refund_transfer, 0));

  payment_method_count :=
    (CASE WHEN refund_cash > 0 THEN 1 ELSE 0 END) +
    (CASE WHEN refund_transfer > 0 THEN 1 ELSE 0 END) +
    (CASE WHEN refund_card > 0 THEN 1 ELSE 0 END);

  IF payment_method_count > 1 THEN
    payment_method_for_return := 'mixed';
  ELSIF refund_cash > 0 THEN
    payment_method_for_return := 'cash';
  ELSIF refund_transfer > 0 THEN
    payment_method_for_return := 'transfer';
  ELSIF refund_card > 0 THEN
    payment_method_for_return := 'card';
  ELSE
    payment_method_for_return := 'credit';
  END IF;

  FOR stock_row IN
    SELECT
      product_id,
      SUM(refund_qty)::INTEGER AS qty
    FROM tmp_refund_rows
    WHERE product_id IS NOT NULL
    GROUP BY product_id
  LOOP
    UPDATE products p
    SET
      available_qty = p.available_qty + stock_row.qty,
      sold_qty = p.sold_qty - stock_row.qty,
      sold_to = CASE
        WHEN (p.sold_qty - stock_row.qty) > 0 THEN p.sold_to
        ELSE NULL
      END,
      sold_at = CASE
        WHEN (p.sold_qty - stock_row.qty) > 0 THEN p.sold_at
        ELSE NULL
      END,
      updated_at = NOW(),
      status = CASE
        WHEN p.quantity - (
          (p.available_qty + stock_row.qty) +
          (p.sold_qty - stock_row.qty) +
          p.donated_qty +
          p.lost_qty +
          p.expired_qty
        ) > 0 THEN 'review'
        WHEN (p.available_qty + stock_row.qty) > 0 THEN 'available'
        WHEN (p.sold_qty - stock_row.qty) > 0 THEN 'sold'
        WHEN p.donated_qty > 0 THEN 'donated'
        WHEN p.lost_qty > 0 THEN 'lost'
        WHEN p.expired_qty > 0 THEN 'expired'
        ELSE 'available'
      END
    WHERE p.id = stock_row.product_id
      AND COALESCE(p.is_deleted, false) = false
      AND p.sold_qty >= stock_row.qty;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'sold_qty_underflow:%', stock_row.product_id;
    END IF;

    restored_product_rows := restored_product_rows + 1;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM transactions
    WHERE id = return_transaction_id
      AND COALESCE(is_deleted, false) = false
  ) THEN
    RAISE EXCEPTION 'return_transaction_id_already_exists';
  END IF;

  INSERT INTO transactions (
    id,
    customer_id,
    customer_name,
    subtotal,
    discount,
    discount_note,
    total,
    payment_method,
    cash_amount,
    transfer_amount,
    card_amount,
    actual_card_amount,
    is_installment,
    installment_amount,
    remaining_balance,
    sold_by,
    ups_batch,
    notes,
    date,
    payment_date,
    type,
    created_at,
    is_deleted
  ) VALUES (
    return_transaction_id,
    tx_record.customer_id,
    tx_record.customer_name,
    -refund_total,
    0,
    NULL,
    -refund_total,
    payment_method_for_return,
    -refund_cash,
    -refund_transfer,
    -refund_card,
    NULL,
    false,
    NULL,
    NULL,
    tx_record.sold_by,
    tx_record.ups_batch,
    FORMAT('Devolucion de venta %s. Razon: %s', target_transaction_id, refund_reason),
    NOW(),
    NOW(),
    'return',
    NOW(),
    false
  );

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
    return_transaction_id,
    fr.product_id,
    fr.product_name,
    fr.refund_qty,
    CASE WHEN fr.refund_qty > 0 THEN fr.refund_total / fr.refund_qty ELSE 0 END AS unit_price,
    fr.refund_total,
    fr.category,
    fr.brand,
    fr.color,
    fr.size
  FROM tmp_refund_rows fr;

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

  RETURN jsonb_build_object(
    'sourceTransactionId', target_transaction_id,
    'returnTransactionId', return_transaction_id,
    'refundTotal', refund_total,
    'refundedItemCount', refunded_item_count,
    'restoredProductRows', restored_product_rows,
    'oldUnpaid', old_unpaid,
    'newUnpaid', new_unpaid,
    'deltaUnpaid', delta_unpaid,
    'cashRefundAmount', refundable_paid
  );
END;
$$ LANGUAGE plpgsql;

