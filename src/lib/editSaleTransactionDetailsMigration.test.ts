import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const baseMigration = readFileSync(
  new URL('../../supabase/migrations/026_edit_sale_transaction_details.sql', import.meta.url),
  'utf8',
);

const hardeningMigration = readFileSync(
  new URL('../../supabase/migrations/027_harden_sale_transaction_edits.sql', import.meta.url),
  'utf8',
);

describe('edit_sale_transaction_details migrations', () => {
  it('keeps migration 026 as the deployable base RPC', () => {
    expect(baseMigration).toContain(
      'CREATE OR REPLACE FUNCTION public.edit_sale_transaction_details(edit_payload jsonb)',
    );
    expect(baseMigration).toContain('pg_advisory_xact_lock');
    expect(baseMigration).not.toContain('CREATE TABLE IF NOT EXISTS public.sale_edit_audit');
    expect(baseMigration).not.toContain("NULLIF(edit_payload->>'expectedUpdatedAt', '')::timestamptz");
  });

  it('keeps the correction in one locking RPC', () => {
    expect(hardeningMigration).toContain('CREATE OR REPLACE FUNCTION public.edit_sale_transaction_details(edit_payload jsonb)');
    expect(hardeningMigration).toContain('pg_advisory_xact_lock');
    expect(hardeningMigration).toContain('FOR UPDATE;');
    expect(hardeningMigration).toContain('FOR UPDATE OF p;');
  });

  it('validates payments, credit and authoritative SAT keys', () => {
    expect(hardeningMigration).toContain("RAISE EXCEPTION 'payment_exceeds_sale_total'");
    expect(hardeningMigration).toContain("RAISE EXCEPTION 'credit_requires_registered_customer'");
    expect(hardeningMigration).toContain('FROM public.sat_keys');
    expect(hardeningMigration).toContain('COALESCE(is_deleted, false) = false');
    expect(hardeningMigration).toContain("RAISE EXCEPTION 'sat_key_not_active:%'");
    expect(hardeningMigration).toContain('public.current_user_can_edit_sales()');
    expect(hardeningMigration).toContain("RAISE EXCEPTION 'insufficient_role'");
    expect(hardeningMigration).toContain("RAISE EXCEPTION 'sale_payment_locked_by_installments'");
  });

  it('allocates cents deterministically and updates inventory by quantity delta', () => {
    expect(hardeningMigration).toContain('WHERE line_no <> last_line_no');
    expect(hardeningMigration).toContain('target_subtotal - allocated_before_last');
    expect(hardeningMigration).toContain('line_total_price');
    expect(hardeningMigration).toContain('source_total_price');
    expect(hardeningMigration).toContain('ALTER COLUMN unit_price TYPE numeric(20, 6)');
    expect(hardeningMigration).toContain('COALESCE(new_qty.qty, 0) - COALESCE(old_qty.qty, 0) AS qty_delta');
    expect(hardeningMigration).toContain("RAISE EXCEPTION 'insufficient_stock:%'");
    expect(hardeningMigration).toContain("RAISE EXCEPTION 'sold_qty_underflow:%'");
  });

  it('updates debt by its difference and derives payment state on the server', () => {
    expect(hardeningMigration).toContain('delta_unpaid := new_unpaid - old_unpaid');
    expect(hardeningMigration).toContain('balance = GREATEST(0, COALESCE(balance, 0) + delta_unpaid)');
    expect(hardeningMigration).toContain("WHEN nonzero_payment_count > 1 THEN 'mixed'");
    expect(hardeningMigration).toContain('is_installment = new_unpaid > 0');
    expect(hardeningMigration).toContain('WHEN requested_card <= 0 THEN NULL');
  });

  it('rejects stale edits and records before/after snapshots atomically', () => {
    expect(hardeningMigration).toContain("RAISE EXCEPTION 'sale_modified_concurrently'");
    expect(hardeningMigration).toContain("NULLIF(edit_payload->>'expectedUpdatedAt', '')::timestamptz");
    expect(hardeningMigration).toContain('CREATE TABLE IF NOT EXISTS public.sale_edit_audit');
    expect(hardeningMigration).toContain('INSERT INTO public.sale_edit_audit');
    expect(hardeningMigration).toContain('old_snapshot');
    expect(hardeningMigration).toContain('new_snapshot');
  });

  it('persists an explicit line order for stable rehydration', () => {
    expect(hardeningMigration).toContain('ADD COLUMN IF NOT EXISTS line_no integer');
    expect(hardeningMigration).toContain('idx_transaction_items_transaction_line');
    expect(hardeningMigration).toContain('transaction_id, line_no, product_id');
  });
});
