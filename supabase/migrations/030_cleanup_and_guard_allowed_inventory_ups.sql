-- Safe UPS inventory cleanup and permanent database guard.
--
-- Active inventory is restricted to UPS 23, 24 and 25. UPS 0 remains a
-- virtual sale line only (transaction_items.product_id IS NULL) and is never
-- represented by a product or drop. Historical sales and accounting rows are
-- intentionally untouched.

BEGIN;

CREATE TABLE IF NOT EXISTS public.allowed_inventory_ups (
  ups_number integer PRIMARY KEY CHECK (ups_number > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.allowed_inventory_ups (ups_number)
VALUES (23), (24), (25)
ON CONFLICT (ups_number) DO NOTHING;

DELETE FROM public.allowed_inventory_ups
WHERE ups_number NOT IN (23, 24, 25);

ALTER TABLE public.allowed_inventory_ups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read allowed inventory UPS" ON public.allowed_inventory_ups;
CREATE POLICY "Authenticated users can read allowed inventory UPS"
  ON public.allowed_inventory_ups
  FOR SELECT
  TO authenticated
  USING (true);

REVOKE ALL ON TABLE public.allowed_inventory_ups FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.allowed_inventory_ups FROM authenticated;
GRANT SELECT ON TABLE public.allowed_inventory_ups TO authenticated;

DO $publication$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'allowed_inventory_ups'
    )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.allowed_inventory_ups;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'drops'
    )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.drops;
  END IF;
END;
$publication$;

CREATE OR REPLACE FUNCTION public.guard_product_inventory_ups()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  canonical_ups integer;
BEGIN
  -- Soft-deleted products may still receive quantity/status adjustments from
  -- historical refund and undo procedures. They must remain hidden.
  IF TG_OP = 'UPDATE' AND NEW.is_deleted IS TRUE THEN
    RETURN NEW;
  END IF;

  IF NEW.drop_number IS NULL
    OR BTRIM(NEW.drop_number) !~ '^\d+$'
    OR NEW.ups_batch IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'inventory_ups_invalid: both drop_number and ups_batch are required';
  END IF;

  canonical_ups := BTRIM(NEW.drop_number)::integer;

  IF NEW.drop_number IS DISTINCT FROM canonical_ups::text
    OR NEW.ups_batch IS DISTINCT FROM canonical_ups
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format(
        'inventory_ups_fields_mismatch: drop_number=%s ups_batch=%s',
        NEW.drop_number,
        NEW.ups_batch
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.allowed_inventory_ups allowed
    WHERE allowed.ups_number = canonical_ups
  )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('inventory_ups_not_allowed:%s', canonical_ups);
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_drop_inventory_ups()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  canonical_ups integer;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.is_deleted IS TRUE THEN
    RETURN NEW;
  END IF;

  IF NEW.drop_number IS NULL OR BTRIM(NEW.drop_number) !~ '^\d+$' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'inventory_ups_invalid: drop_number is required';
  END IF;

  canonical_ups := BTRIM(NEW.drop_number)::integer;

  IF NEW.drop_number IS DISTINCT FROM canonical_ups::text THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('inventory_ups_fields_mismatch: drop_number=%s', NEW.drop_number);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.allowed_inventory_ups allowed
    WHERE allowed.ups_number = canonical_ups
  )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('inventory_ups_not_allowed:%s', canonical_ups);
  END IF;

  RETURN NEW;
END;
$$;

-- Prefer a valid drop_number, then a valid legacy ups_batch. This repairs
-- drift between the redundant fields without losing an otherwise valid row.
WITH normalized AS (
  SELECT
    product.id,
    CASE
      WHEN BTRIM(COALESCE(product.drop_number, '')) ~ '^\d+$'
        AND EXISTS (
          SELECT 1 FROM public.allowed_inventory_ups allowed
          WHERE allowed.ups_number = BTRIM(product.drop_number)::integer
        )
        THEN BTRIM(product.drop_number)::integer
      WHEN EXISTS (
        SELECT 1 FROM public.allowed_inventory_ups allowed
        WHERE allowed.ups_number = product.ups_batch
      )
        THEN product.ups_batch
      ELSE NULL
    END AS canonical_ups
  FROM public.products product
  WHERE COALESCE(product.is_deleted, false) = false
)
UPDATE public.products product
SET
  drop_number = normalized.canonical_ups::text,
  ups_batch = normalized.canonical_ups,
  updated_at = clock_timestamp()
FROM normalized
WHERE product.id = normalized.id
  AND normalized.canonical_ups IS NOT NULL
  AND (
    product.drop_number IS DISTINCT FROM normalized.canonical_ups::text
    OR product.ups_batch IS DISTINCT FROM normalized.canonical_ups
  );

-- All product states are included. This is recoverable soft deletion and does
-- not modify transaction_items or any other historical/accounting table.
UPDATE public.products product
SET
  is_deleted = true,
  deleted_at = COALESCE(product.deleted_at, clock_timestamp()),
  updated_at = clock_timestamp()
WHERE COALESCE(product.is_deleted, false) = false
  AND NOT EXISTS (
    SELECT 1
    FROM public.allowed_inventory_ups allowed
    WHERE product.drop_number = allowed.ups_number::text
      AND product.ups_batch = allowed.ups_number
  );

-- Includes UPS 0 and malformed/legacy lot labels.
UPDATE public.drops drop_row
SET
  is_deleted = true,
  deleted_at = COALESCE(drop_row.deleted_at, clock_timestamp()),
  updated_at = clock_timestamp()
WHERE COALESCE(drop_row.is_deleted, false) = false
  AND NOT EXISTS (
    SELECT 1
    FROM public.allowed_inventory_ups allowed
    WHERE drop_row.drop_number = allowed.ups_number::text
  );

DO $stats$
DECLARE
  allowed_row record;
BEGIN
  IF to_regprocedure('public.recalculate_drop_stats(text)') IS NULL THEN
    RAISE EXCEPTION 'Required function public.recalculate_drop_stats(text) is missing';
  END IF;

  FOR allowed_row IN
    SELECT ups_number FROM public.allowed_inventory_ups ORDER BY ups_number
  LOOP
    PERFORM public.recalculate_drop_stats(allowed_row.ups_number::text);
  END LOOP;
END;
$stats$;

-- Install permanent guards only after cleanup. Existing product-stat triggers
-- may update old drop rows while the cleanup runs.
DROP TRIGGER IF EXISTS tr_guard_product_inventory_ups ON public.products;
CREATE TRIGGER tr_guard_product_inventory_ups
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_product_inventory_ups();

DROP TRIGGER IF EXISTS tr_guard_drop_inventory_ups ON public.drops;
CREATE TRIGGER tr_guard_drop_inventory_ups
  BEFORE INSERT OR UPDATE ON public.drops
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_drop_inventory_ups();

-- Preserve edits of sales that reference hidden inventory. An unchanged line
-- may remain, and a quantity may be reduced/restored into the hidden product.
-- Positive deltas still require an active product and therefore cannot add or
-- increase old inventory.
DO $patch_sale_functions$
DECLARE
  function_definition text;
  old_fragment text;
  new_fragment text;
BEGIN
  IF to_regprocedure('public.edit_sale_transaction_details(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Required function public.edit_sale_transaction_details(jsonb) is missing';
  END IF;

  SELECT pg_get_functiondef('public.edit_sale_transaction_details(jsonb)'::regprocedure)
  INTO function_definition;

  -- pg_get_functiondef preserves the function body's original whitespace,
  -- including CRLF when it was pasted through the SQL editor. Match the
  -- semantic fragment instead of requiring the migration file's exact layout.
  old_fragment := '(LEFT JOIN[[:space:]]+(public[.])?products[[:space:]]+p[[:space:]]+ON[[:space:]]+p[.]id[[:space:]]*=[[:space:]]*requested[.]product_id)[[:space:]]+AND[[:space:]]+COALESCE[(][[:space:]]*p[.]is_deleted[[:space:]]*,[[:space:]]*false[[:space:]]*[)][[:space:]]*=[[:space:]]*false([[:space:]]+WHERE[[:space:]]+p[.]id[[:space:]]+IS[[:space:]]+NULL)';
  new_fragment := regexp_replace(function_definition, old_fragment, E'\\1\\3');
  IF new_fragment = function_definition THEN
    RAISE EXCEPTION 'Unexpected edit_sale_transaction_details product validation body';
  END IF;
  function_definition := new_fragment;

  old_fragment := '(WHERE[[:space:]]+p[.]id[[:space:]]*=[[:space:]]*delta_record[.]product_id[[:space:]]+)AND[[:space:]]+COALESCE[(][[:space:]]*p[.]is_deleted[[:space:]]*,[[:space:]]*false[[:space:]]*[)][[:space:]]*=[[:space:]]*false([[:space:]]+AND[[:space:]]+p[.]sold_qty[[:space:]]*>=[[:space:]]*ABS[(][[:space:]]*delta_record[.]qty_delta[[:space:]]*[)][[:space:]]*;)';
  new_fragment := regexp_replace(function_definition, old_fragment, E'\\1\\2');
  IF new_fragment = function_definition THEN
    RAISE EXCEPTION 'Unexpected edit_sale_transaction_details restore body';
  END IF;
  function_definition := new_fragment;
  EXECUTE function_definition;

  -- Keep the legacy edit RPC compatible as well while it remains published.
  IF to_regprocedure('public.modify_sale_transaction_inventory_base_v024(jsonb)') IS NOT NULL THEN
    SELECT pg_get_functiondef(
      'public.modify_sale_transaction_inventory_base_v024(jsonb)'::regprocedure
    ) INTO function_definition;

    old_fragment := '(LEFT JOIN products p ON p[.]id = ni[.]product_id) AND COALESCE[(]p[.]is_deleted, false[)] = false';
    new_fragment := regexp_replace(function_definition, old_fragment, E'\\1');
    IF new_fragment = function_definition THEN
      RAISE EXCEPTION 'Unexpected modify_sale_transaction product validation body';
    END IF;
    function_definition := new_fragment;

    old_fragment := '(WHERE p[.]id = delta_record[.]product_id[[:space:]]+)AND COALESCE[(]p[.]is_deleted, false[)] = false([[:space:]]+AND p[.]sold_qty >= ABS[(]delta_record[.]qty_delta[)];)';
    new_fragment := regexp_replace(function_definition, old_fragment, E'\\1\\2');
    IF new_fragment = function_definition THEN
      RAISE EXCEPTION 'Unexpected modify_sale_transaction restore body';
    END IF;
    function_definition := new_fragment;
    EXECUTE function_definition;
  END IF;

  IF to_regprocedure('public.refund_sale_transaction_from_edit_inventory_base_v024(jsonb)') IS NOT NULL THEN
    SELECT pg_get_functiondef(
      'public.refund_sale_transaction_from_edit_inventory_base_v024(jsonb)'::regprocedure
    ) INTO function_definition;

    old_fragment := '(WHERE p[.]id = stock_row[.]product_id[[:space:]]+)AND COALESCE[(]p[.]is_deleted, false[)] = false([[:space:]]+AND p[.]sold_qty >= stock_row[.]qty;)';
    new_fragment := regexp_replace(function_definition, old_fragment, E'\\1\\2');
    IF new_fragment = function_definition THEN
      RAISE EXCEPTION 'Unexpected refund inventory restore body';
    END IF;
    function_definition := new_fragment;
    EXECUTE function_definition;
  END IF;
END;
$patch_sale_functions$;

COMMENT ON TABLE public.allowed_inventory_ups IS
  'Central registry of UPS numbers allowed to create or reactivate inventory.';

COMMIT;
