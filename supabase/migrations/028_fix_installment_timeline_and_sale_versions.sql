-- Fix chronological installment allocation and make sale versions server-owned.
-- Migration 027 must already be applied. This migration fails explicitly if
-- the expected 027 RPC body is not installed, avoiding a partial hardening.

CREATE OR REPLACE FUNCTION public.touch_transaction_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Clients must never be able to restore a stale optimistic-lock version.
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

DO $migration$
DECLARE
  rpc_body text;
  patched_body text;
BEGIN
  SELECT procedure.prosrc
  INTO rpc_body
  FROM pg_proc procedure
  JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname = 'edit_sale_transaction_details'
    AND pg_get_function_identity_arguments(procedure.oid) = 'edit_payload jsonb';

  IF rpc_body IS NULL THEN
    RAISE EXCEPTION 'migration_028_requires_edit_sale_transaction_details_from_027';
  END IF;

  patched_body := REPLACE(
    rpc_body,
$old_declarations$  inventory_changed boolean := false;
  delta_record record;
  result_item_count integer;$old_declarations$,
$new_declarations$  inventory_changed boolean := false;
  delta_record record;
  account_event record;
  outstanding_sale record;
  payment_remaining numeric;
  payment_allocation numeric;
  result_item_count integer;$new_declarations$
  );

  IF patched_body = rpc_body THEN
    RAISE EXCEPTION 'migration_028_expected_rpc_declarations_not_found';
  END IF;
  rpc_body := patched_body;

  patched_body := REPLACE(
    rpc_body,
$old_installments$  -- Installment payments are allocated FIFO by customer in the existing app.
  -- Keep them separate from the payment columns stored on the sale itself.
  IF tx_record.customer_id IS NOT NULL AND old_unpaid > 0 THEN
    SELECT COALESCE(SUM(COALESCE(payment.total, 0)), 0)
    INTO installment_total
    FROM public.transactions payment
    WHERE payment.customer_id = tx_record.customer_id
      AND payment.type = 'installment_payment'
      AND COALESCE(payment.is_deleted, false) = false;

    SELECT COALESCE(SUM(GREATEST(
      COALESCE(sale.total, 0) -
      COALESCE(sale.cash_amount, 0) -
      COALESCE(sale.transfer_amount, 0) -
      COALESCE(sale.card_amount, 0),
      0
    )), 0)
    INTO debt_before_target
    FROM public.transactions sale
    WHERE sale.customer_id = tx_record.customer_id
      AND sale.type = 'sale'
      AND COALESCE(sale.is_deleted, false) = false
      AND (
        sale.date < tx_record.date
        OR (sale.date = tx_record.date AND sale.id < tx_record.id)
      );

    installment_applied := LEAST(
      old_unpaid,
      GREATEST(installment_total - debt_before_target, 0)
    );
  END IF;

  IF installment_applied > 0 AND (
    requested_cash <> ROUND(COALESCE(tx_record.cash_amount, 0), 2)
    OR requested_transfer <> ROUND(COALESCE(tx_record.transfer_amount, 0), 2)
    OR requested_card <> ROUND(COALESCE(tx_record.card_amount, 0), 2)
  ) THEN
    RAISE EXCEPTION 'sale_payment_locked_by_installments';
  END IF;

  new_unpaid := GREATEST(requested_total - requested_paid, 0);
  IF new_unpaid > 0 AND tx_record.customer_id IS NULL THEN
    RAISE EXCEPTION 'credit_requires_registered_customer';
  END IF;$old_installments$,
$new_installments$  -- Allocate installment payments only to debt that existed when each
  -- payment was recorded. Excess payments are not carried into future sales.
  IF tx_record.customer_id IS NOT NULL AND old_unpaid > 0 THEN
    CREATE TEMP TABLE tmp_customer_sale_debts (
      sale_id text PRIMARY KEY,
      sale_date timestamptz NOT NULL,
      remaining numeric NOT NULL CHECK (remaining >= 0)
    ) ON COMMIT DROP;

    FOR account_event IN
      SELECT
        account_transaction.id,
        account_transaction.type,
        account_transaction.date,
        CASE
          WHEN account_transaction.type = 'sale' THEN GREATEST(
            COALESCE(account_transaction.total, 0) -
            COALESCE(account_transaction.cash_amount, 0) -
            COALESCE(account_transaction.transfer_amount, 0) -
            COALESCE(account_transaction.card_amount, 0),
            0
          )
          ELSE GREATEST(COALESCE(account_transaction.total, 0), 0)
        END AS amount
      FROM public.transactions account_transaction
      WHERE account_transaction.customer_id = tx_record.customer_id
        AND account_transaction.type IN ('sale', 'installment_payment')
        AND COALESCE(account_transaction.is_deleted, false) = false
      ORDER BY
        account_transaction.date,
        CASE WHEN account_transaction.type = 'sale' THEN 0 ELSE 1 END,
        account_transaction.id
    LOOP
      IF account_event.type = 'sale' THEN
        INSERT INTO tmp_customer_sale_debts (sale_id, sale_date, remaining)
        VALUES (account_event.id, account_event.date, account_event.amount);
      ELSE
        payment_remaining := account_event.amount;

        FOR outstanding_sale IN
          SELECT sale_id, remaining
          FROM tmp_customer_sale_debts
          WHERE remaining > 0
          ORDER BY sale_date, sale_id
        LOOP
          EXIT WHEN payment_remaining <= 0;
          payment_allocation := LEAST(outstanding_sale.remaining, payment_remaining);

          UPDATE tmp_customer_sale_debts
          SET remaining = remaining - payment_allocation
          WHERE sale_id = outstanding_sale.sale_id;

          payment_remaining := payment_remaining - payment_allocation;
        END LOOP;
      END IF;
    END LOOP;

    SELECT GREATEST(old_unpaid - remaining, 0)
    INTO installment_applied
    FROM tmp_customer_sale_debts
    WHERE sale_id = target_transaction_id;

    installment_applied := COALESCE(installment_applied, 0);
  END IF;

  new_unpaid := GREATEST(requested_total - requested_paid, 0);

  -- Method corrections and safe payment increases remain editable. Prevent
  -- removing historical payment or making applied installments exceed debt.
  IF installment_applied > 0 AND (
    requested_paid < old_paid
    OR new_unpaid < installment_applied
  ) THEN
    RAISE EXCEPTION 'sale_payment_locked_by_installments';
  END IF;

  IF new_unpaid > 0 AND tx_record.customer_id IS NULL THEN
    RAISE EXCEPTION 'credit_requires_registered_customer';
  END IF;$new_installments$
  );

  IF patched_body = rpc_body THEN
    RAISE EXCEPTION 'migration_028_expected_installment_block_not_found';
  END IF;
  rpc_body := patched_body;

  patched_body := REPLACE(
    rpc_body,
$old_version_update$  next_updated_at := clock_timestamp();

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
    date = requested_date,
    updated_at = next_updated_at
  WHERE id = target_transaction_id;$old_version_update$,
$new_version_update$  UPDATE public.transactions
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
  WHERE id = target_transaction_id
  RETURNING updated_at INTO next_updated_at;$new_version_update$
  );

  IF patched_body = rpc_body THEN
    RAISE EXCEPTION 'migration_028_expected_version_update_not_found';
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.edit_sale_transaction_details(edit_payload jsonb) '
    'RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER '
    'SET search_path = public, pg_temp AS %L',
    patched_body
  );
END;
$migration$;

REVOKE ALL ON FUNCTION public.edit_sale_transaction_details(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edit_sale_transaction_details(jsonb) TO authenticated;
