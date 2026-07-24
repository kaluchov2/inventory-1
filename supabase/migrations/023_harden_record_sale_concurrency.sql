-- Serialize retries of the same sale and ensure only the execution that inserts
-- the transaction header may apply items, stock, or customer balance changes.
CREATE OR REPLACE FUNCTION public.record_sale(sale_payload jsonb)
RETURNS void AS $$
DECLARE
  tx jsonb := sale_payload->'transaction';
  customer_update jsonb := sale_payload->'customer';
  product_update jsonb;
  inserted_transaction_id text;
BEGIN
  IF tx IS NULL OR tx->>'id' IS NULL THEN
    RAISE EXCEPTION 'record_sale requires transaction.id';
  END IF;

  -- A client timeout can leave the original database request running while a
  -- retry starts. Serialize both executions before checking idempotency.
  PERFORM pg_advisory_xact_lock(hashtextextended(tx->>'id', 0));

  IF EXISTS (
    SELECT 1
    FROM transactions
    WHERE id = tx->>'id'
      AND COALESCE(is_deleted, false) = false
  ) THEN
    RETURN;
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
    tx->>'id',
    NULLIF(tx->>'customerId', ''),
    tx->>'customerName',
    COALESCE((tx->>'subtotal')::numeric, 0),
    COALESCE((tx->>'discount')::numeric, 0),
    NULLIF(tx->>'discountNote', ''),
    COALESCE((tx->>'total')::numeric, 0),
    tx->>'paymentMethod',
    COALESCE((tx->>'cashAmount')::numeric, 0),
    COALESCE((tx->>'transferAmount')::numeric, 0),
    COALESCE((tx->>'cardAmount')::numeric, 0),
    NULLIF(tx->>'actualCardAmount', '')::numeric,
    COALESCE((tx->>'isInstallment')::boolean, false),
    NULLIF(tx->>'installmentAmount', '')::numeric,
    NULLIF(tx->>'remainingBalance', '')::numeric,
    NULLIF(tx->>'soldBy', ''),
    NULLIF(tx->>'upsBatch', '')::integer,
    NULLIF(tx->>'notes', ''),
    COALESCE(NULLIF(tx->>'date', ''), now()::text)::timestamptz,
    NULLIF(tx->>'paymentDate', '')::timestamptz,
    tx->>'type',
    COALESCE(NULLIF(tx->>'createdAt', ''), now()::text)::timestamptz,
    false
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING id INTO inserted_transaction_id;

  -- Defensive ownership check: even if another caller inserted the same id
  -- outside this function, never continue into non-idempotent side effects.
  IF inserted_transaction_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO transaction_items (
    transaction_id,
    product_id,
    product_name,
    quantity,
    unit_price,
    total_price,
    sat_key_id,
    sat_key_code,
    sat_key_description,
    category,
    brand,
    color,
    size
  )
  SELECT
    tx->>'id',
    NULLIF(item->>'productId', ''),
    item->>'productName',
    COALESCE((item->>'quantity')::integer, 0),
    COALESCE((item->>'unitPrice')::numeric, 0),
    COALESCE((item->>'totalPrice')::numeric, 0),
    NULLIF(item->>'satKeyId', ''),
    NULLIF(item->>'satKeyCode', ''),
    NULLIF(item->>'satKeyDescription', ''),
    NULLIF(item->>'category', ''),
    NULLIF(item->>'brand', ''),
    NULLIF(item->>'color', ''),
    NULLIF(item->>'size', '')
  FROM jsonb_array_elements(COALESCE(tx->'items', '[]'::jsonb)) AS item;

  FOR product_update IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(sale_payload->'products', '[]'::jsonb))
  LOOP
    UPDATE products
    SET
      available_qty = CASE
        WHEN COALESCE((product_update->>'decrementAvailable')::boolean, true)
          THEN available_qty - COALESCE((product_update->>'qty')::integer, 0)
        ELSE available_qty
      END,
      sold_qty = sold_qty + COALESCE((product_update->>'qty')::integer, 0),
      sold_to = NULLIF(product_update->'snapshot'->>'soldTo', ''),
      sold_at = NULLIF(product_update->'snapshot'->>'soldAt', '')::timestamptz,
      updated_at = COALESCE(NULLIF(product_update->'snapshot'->>'updatedAt', ''), now()::text)::timestamptz,
      status = CASE
        WHEN quantity - (
          (CASE
            WHEN COALESCE((product_update->>'decrementAvailable')::boolean, true)
              THEN available_qty - COALESCE((product_update->>'qty')::integer, 0)
            ELSE available_qty
          END) +
          (sold_qty + COALESCE((product_update->>'qty')::integer, 0)) +
          donated_qty +
          lost_qty +
          expired_qty
        ) > 0 THEN 'review'
        WHEN (CASE
          WHEN COALESCE((product_update->>'decrementAvailable')::boolean, true)
            THEN available_qty - COALESCE((product_update->>'qty')::integer, 0)
          ELSE available_qty
        END) > 0 THEN 'available'
        WHEN sold_qty + COALESCE((product_update->>'qty')::integer, 0) > 0 THEN 'sold'
        WHEN donated_qty > 0 THEN 'donated'
        WHEN lost_qty > 0 THEN 'lost'
        WHEN expired_qty > 0 THEN 'expired'
        ELSE 'available'
      END
    WHERE id = product_update->>'id'
      AND (
        CASE
          WHEN COALESCE((product_update->>'decrementAvailable')::boolean, true)
            THEN available_qty >= COALESCE((product_update->>'qty')::integer, 0)
          ELSE quantity - available_qty - sold_qty - donated_qty - lost_qty - expired_qty >= COALESCE((product_update->>'qty')::integer, 0)
        END
      );

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Could not move stock for product %', product_update->>'id';
    END IF;
  END LOOP;

  IF customer_update IS NOT NULL AND customer_update->'snapshot'->>'id' IS NOT NULL THEN
    UPDATE customers
    SET
      balance = balance + COALESCE((customer_update->>'balanceDelta')::numeric, 0),
      total_purchases = total_purchases + COALESCE((customer_update->>'purchaseDelta')::numeric, 0),
      updated_at = COALESCE(NULLIF(customer_update->'snapshot'->>'updatedAt', ''), now()::text)::timestamptz
    WHERE id = customer_update->'snapshot'->>'id';

    IF NOT FOUND THEN
      INSERT INTO customers (
        id,
        name,
        reference,
        phone,
        email,
        balance,
        total_purchases,
        created_at,
        updated_at,
        is_deleted
      ) VALUES (
        customer_update->'snapshot'->>'id',
        customer_update->'snapshot'->>'name',
        NULLIF(customer_update->'snapshot'->>'reference', ''),
        NULLIF(customer_update->'snapshot'->>'phone', ''),
        NULLIF(customer_update->'snapshot'->>'email', ''),
        COALESCE((customer_update->'snapshot'->>'balance')::numeric, 0),
        COALESCE((customer_update->'snapshot'->>'totalPurchases')::numeric, 0),
        COALESCE(NULLIF(customer_update->'snapshot'->>'createdAt', ''), now()::text)::timestamptz,
        COALESCE(NULLIF(customer_update->'snapshot'->>'updatedAt', ''), now()::text)::timestamptz,
        false
      );
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql;
