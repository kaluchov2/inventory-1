-- Undo a sale transaction atomically.
-- Reverts product stock movement, reverts customer unpaid aggregate impact,
-- and soft-deletes the transaction row.

CREATE OR REPLACE FUNCTION undo_sale_transaction(undo_payload jsonb)
RETURNS jsonb AS $$
DECLARE
  target_transaction_id TEXT := NULLIF(undo_payload->>'transactionId', '');
  undo_reason TEXT := NULLIF(undo_payload->>'reason', '');
  tx_record transactions%ROWTYPE;
  stock_row record;
  paid_amount NUMERIC;
  unpaid_reverted NUMERIC;
  restored_product_rows INTEGER := 0;
BEGIN
  IF target_transaction_id IS NULL THEN
    RAISE EXCEPTION 'undo_sale_transaction requires transactionId';
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

  FOR stock_row IN
    SELECT product_id, SUM(quantity)::INTEGER AS qty
    FROM transaction_items
    WHERE transaction_id = target_transaction_id
      AND product_id IS NOT NULL
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
      AND p.sold_qty >= stock_row.qty;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'sold_qty_underflow:%', stock_row.product_id;
    END IF;

    restored_product_rows := restored_product_rows + 1;
  END LOOP;

  paid_amount :=
    COALESCE(tx_record.cash_amount, 0) +
    COALESCE(tx_record.transfer_amount, 0) +
    COALESCE(tx_record.card_amount, 0);
  unpaid_reverted := GREATEST(COALESCE(tx_record.total, 0) - paid_amount, 0);

  IF tx_record.customer_id IS NOT NULL AND unpaid_reverted > 0 THEN
    UPDATE customers
    SET
      balance = GREATEST(0, balance - unpaid_reverted),
      total_purchases = GREATEST(0, total_purchases - unpaid_reverted),
      updated_at = NOW()
    WHERE id = tx_record.customer_id
      AND COALESCE(is_deleted, false) = false;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'customer_not_found:%', tx_record.customer_id;
    END IF;
  END IF;

  UPDATE transactions
  SET
    is_deleted = true,
    deleted_at = NOW(),
    notes = CASE
      WHEN undo_reason IS NULL THEN tx_record.notes
      ELSE TRIM(BOTH FROM COALESCE(tx_record.notes, '') || E'\nUNDO: ' || undo_reason)
    END
  WHERE id = target_transaction_id;

  RETURN jsonb_build_object(
    'transactionId', target_transaction_id,
    'total', COALESCE(tx_record.total, 0),
    'paidAmount', paid_amount,
    'unpaidReverted', unpaid_reverted,
    'restoredProductRows', restored_product_rows
  );
END;
$$ LANGUAGE plpgsql;
