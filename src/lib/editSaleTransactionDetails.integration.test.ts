import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const migration = (name: string) => readFileSync(
  new URL(`../../supabase/migrations/${name}`, import.meta.url),
  'utf8',
).replace(/^\uFEFF/, '');

const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const VIEWER_ID = '22222222-2222-2222-2222-222222222222';

let db: PGlite;

async function rows<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}

async function asUser(id: string) {
  await db.query(`SELECT set_config('app.uid', $1, false)`, [id]);
}

async function callRpc(payload: Record<string, unknown>) {
  const result = await rows<{ out: Record<string, unknown> }>(
    `SELECT public.edit_sale_transaction_details($1::jsonb) AS out`,
    [JSON.stringify(payload)],
  );
  return result[0].out;
}

interface SeedItem {
  productId: string;
  productName?: string;
  quantity: number;
  unitPrice: number;
}

async function seedSale(options: {
  id: string;
  customerId?: string;
  total: number;
  cash?: number;
  transfer?: number;
  card?: number;
  discount?: number;
  date?: string;
  items: SeedItem[];
}) {
  const {
    id, customerId, total, cash = 0, transfer = 0, card = 0, discount = 0,
    date = '2026-05-01T10:00:00Z', items,
  } = options;
  await rows(
    `INSERT INTO transactions (
      id, customer_id, customer_name, subtotal, discount, total, payment_method,
      cash_amount, transfer_amount, card_amount, date, type, created_at
    ) VALUES ($1, $2, 'Cliente', $3, $4, $5, 'cash', $6, $7, $8, $9, 'sale', NOW())`,
    [id, customerId ?? null, total + discount, discount, total, cash, transfer, card, date],
  );

  for (const item of items) {
    await rows(
      `INSERT INTO transaction_items (
        transaction_id, product_id, product_name, quantity, unit_price, total_price
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, item.productId, item.productName ?? item.productId, item.quantity, item.unitPrice, item.quantity * item.unitPrice],
    );
  }

  return (await rows<{ updated_at: string }>(
    `SELECT updated_at FROM transactions WHERE id = $1`,
    [id],
  ))[0].updated_at;
}

function editPayload(options: {
  transactionId: string;
  expectedUpdatedAt: string;
  total: number;
  cash?: number;
  transfer?: number;
  card?: number;
  date?: string;
  items: SeedItem[];
  notes?: string;
}) {
  return {
    transactionId: options.transactionId,
    expectedUpdatedAt: options.expectedUpdatedAt,
    date: options.date ?? '2026-05-01T10:00:00Z',
    total: options.total,
    cashAmount: options.cash ?? 0,
    transferAmount: options.transfer ?? 0,
    cardAmount: options.card ?? 0,
    notes: options.notes,
    items: options.items.map((item) => ({
      productId: item.productId,
      productName: item.productName ?? item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.quantity * item.unitPrice,
    })),
  };
}

async function seedInstallment(id: string, customerId: string, total: number, date: string) {
  await rows(
    `INSERT INTO transactions (
      id, customer_id, customer_name, subtotal, discount, total, payment_method,
      cash_amount, transfer_amount, card_amount, date, type, created_at
    ) VALUES ($1, $2, 'Cliente', $3, 0, $3, 'cash', $3, 0, 0, $4, 'installment_payment', NOW())`,
    [id, customerId, total, date],
  );
}

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
    END $$;

    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('app.uid', true), '')::uuid;
    $$;

    CREATE TABLE profiles (id uuid PRIMARY KEY, role text NOT NULL DEFAULT 'user');
    CREATE TABLE customers (
      id text PRIMARY KEY, name text, balance numeric DEFAULT 0,
      total_purchases numeric DEFAULT 0, updated_at timestamptz DEFAULT NOW(), is_deleted boolean DEFAULT false
    );
    CREATE TABLE products (
      id text PRIMARY KEY, name text, quantity integer DEFAULT 0, unit_price numeric DEFAULT 0,
      drop_number text, ups_batch integer, deleted_at timestamptz,
      available_qty integer DEFAULT 0, sold_qty integer DEFAULT 0, donated_qty integer DEFAULT 0,
      lost_qty integer DEFAULT 0, expired_qty integer DEFAULT 0, status text DEFAULT 'available',
      sold_to text, sold_at timestamptz, updated_at timestamptz DEFAULT NOW(), is_deleted boolean DEFAULT false
    );
    CREATE TABLE drops (
      id text PRIMARY KEY, drop_number text NOT NULL UNIQUE,
      arrival_date timestamptz DEFAULT NOW(), status text DEFAULT 'active',
      total_products integer DEFAULT 0, total_units integer DEFAULT 0,
      total_value numeric DEFAULT 0, sold_count integer DEFAULT 0,
      available_count integer DEFAULT 0, updated_at timestamptz DEFAULT NOW(),
      is_deleted boolean DEFAULT false, deleted_at timestamptz
    );
    CREATE OR REPLACE FUNCTION public.recalculate_drop_stats(p_drop_number text)
    RETURNS void LANGUAGE plpgsql AS $$
    BEGIN
      UPDATE drops
      SET total_products = (
        SELECT COUNT(*)::integer FROM products
        WHERE drop_number = p_drop_number AND is_deleted = false
      ), updated_at = NOW()
      WHERE drop_number = p_drop_number;
    END;
    $$;
    CREATE TABLE sat_keys (id text PRIMARY KEY, code text, description text, is_deleted boolean DEFAULT false);
    CREATE TABLE transactions (
      id text PRIMARY KEY, customer_id text, customer_name text,
      subtotal numeric, discount numeric DEFAULT 0, discount_note text, total numeric,
      payment_method text, cash_amount numeric DEFAULT 0, transfer_amount numeric DEFAULT 0,
      card_amount numeric DEFAULT 0, actual_card_amount numeric, is_installment boolean DEFAULT false,
      installment_amount numeric, remaining_balance numeric, ups_batch text, notes text,
      date timestamptz, payment_date timestamptz, type text, sold_by text,
      created_at timestamptz DEFAULT NOW(), is_deleted boolean DEFAULT false,
      deleted_at timestamptz
    );
    CREATE TABLE transaction_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      transaction_id text NOT NULL REFERENCES transactions(id),
      product_id text, product_name text NOT NULL, quantity integer NOT NULL,
      unit_price numeric NOT NULL, total_price numeric NOT NULL,
      sat_key_id text, sat_key_code text, sat_key_description text,
      category text, brand text, color text, size text
    );
  `);

  await db.exec(migration('026_edit_sale_transaction_details.sql'));
  await db.exec(migration('027_harden_sale_transaction_edits.sql'));
  await db.exec(migration('028_fix_installment_timeline_and_sale_versions.sql'));
  await db.exec(migration('029_fix_sale_editor_safeupdate.sql'));
  await db.exec(migration('012_harden_undo_sale_transaction_unregistered_items.sql'));
  await db.exec(`
    CREATE OR REPLACE FUNCTION public.modify_sale_transaction_inventory_base_v024(edit_payload jsonb)
    RETURNS jsonb LANGUAGE plpgsql AS $$
    DECLARE
      delta_record record;
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM (SELECT edit_payload->>'productId' AS product_id) ni
        LEFT JOIN products p ON p.id = ni.product_id AND COALESCE(p.is_deleted, false) = false
        WHERE p.id IS NULL
      ) THEN
        RAISE EXCEPTION 'product_not_found';
      END IF;

      FOR delta_record IN
        SELECT edit_payload->>'productId' AS product_id,
          COALESCE((edit_payload->>'qtyDelta')::integer, 0) AS qty_delta
      LOOP
        IF delta_record.qty_delta > 0 THEN
          UPDATE products p
          SET available_qty = p.available_qty - delta_record.qty_delta,
            sold_qty = p.sold_qty + delta_record.qty_delta
          WHERE p.id = delta_record.product_id
            AND COALESCE(p.is_deleted, false) = false
            AND p.available_qty >= delta_record.qty_delta;
        ELSE
          UPDATE products p
          SET available_qty = p.available_qty + ABS(delta_record.qty_delta),
            sold_qty = p.sold_qty - ABS(delta_record.qty_delta)
          WHERE p.id = delta_record.product_id
            AND COALESCE(p.is_deleted, false) = false
            AND p.sold_qty >= ABS(delta_record.qty_delta);
        END IF;
      END LOOP;
      RETURN jsonb_build_object('inventoryChanged', true);
    END;
    $$;

    CREATE OR REPLACE FUNCTION public.refund_sale_transaction_from_edit_inventory_base_v024(edit_payload jsonb)
    RETURNS jsonb LANGUAGE plpgsql AS $$
    DECLARE
      stock_row record;
    BEGIN
      FOR stock_row IN
        SELECT edit_payload->>'productId' AS product_id,
          COALESCE((edit_payload->>'quantity')::integer, 0) AS qty
      LOOP
        UPDATE products p
        SET
          available_qty = p.available_qty + stock_row.qty,
          sold_qty = p.sold_qty - stock_row.qty,
          updated_at = NOW()
        WHERE p.id = stock_row.product_id
          AND COALESCE(p.is_deleted, false) = false
          AND p.sold_qty >= stock_row.qty;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'sold_qty_underflow:%', stock_row.product_id;
        END IF;
      END LOOP;
      RETURN jsonb_build_object('restoredProductRows', 1);
    END;
    $$;
  `);
  await db.exec(`
    INSERT INTO drops (id, drop_number) VALUES
      ('cleanup-drop-0', '0'),
      ('cleanup-drop-22', '22'),
      ('cleanup-drop-23', '23');
    INSERT INTO products (
      id, name, drop_number, ups_batch, available_qty, sold_qty, status
    ) VALUES
      ('cleanup-product-22', 'Producto UPS 22', '22', 22, 0, 1, 'sold'),
      ('cleanup-product-available', 'Disponible UPS 22', '22', 22, 1, 0, 'available'),
      ('cleanup-product-reserved', 'Reservado UPS 22', '22', 22, 1, 0, 'reserved'),
      ('cleanup-product-promotional', 'Promoción UPS 22', '22', 22, 1, 0, 'promotional'),
      ('cleanup-product-donated', 'Donado UPS 22', '22', 22, 0, 0, 'donated'),
      ('cleanup-product-lost', 'Perdido UPS 22', '22', 22, 0, 0, 'lost'),
      ('cleanup-product-expired', 'Caducado UPS 22', '22', 22, 0, 0, 'expired'),
      ('cleanup-product-review', 'Revisión UPS 22', '22', 22, 0, 0, 'review'),
      ('cleanup-product-mismatch', 'Producto UPS reparable', '23', 22, 1, 0, 'available');
  `);
  await db.exec(migration('030_cleanup_and_guard_allowed_inventory_ups.sql'));
  await db.exec(`
    GRANT USAGE ON SCHEMA public, auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
    ALTER TABLE sale_edit_audit FORCE ROW LEVEL SECURITY;

    INSERT INTO profiles (id, role) VALUES ('${ADMIN_ID}', 'admin'), ('${VIEWER_ID}', 'viewer');
    INSERT INTO products (id, name, drop_number, ups_batch, available_qty, sold_qty) VALUES
      ('integration-product-a', 'Producto A', '23', 23, 100, 0),
      ('integration-product-b', 'Producto B', '24', 24, 100, 0),
      ('integration-product-c', 'Producto C', '25', 25, 100, 0);
  `);
  await asUser(ADMIN_ID);
}, 30_000);

afterAll(async () => {
  await db?.close();
});

describe.sequential('edit_sale_transaction_details PostgreSQL integration', () => {
  it('cleans every old UPS state, normalizes retained products and guards new writes', async () => {
    expect((await rows<{ id: string; is_deleted: boolean }>(`
      SELECT id, is_deleted FROM products
      WHERE id IN ('cleanup-product-22', 'cleanup-product-mismatch')
      ORDER BY id
    `))).toEqual([
      { id: 'cleanup-product-22', is_deleted: true },
      { id: 'cleanup-product-mismatch', is_deleted: false },
    ]);
    expect((await rows<{ drop_number: string; ups_batch: number }>(`
      SELECT drop_number, ups_batch FROM products WHERE id = 'cleanup-product-mismatch'
    `))[0]).toEqual({ drop_number: '23', ups_batch: 23 });
    expect((await rows<{ count: number }>(`
      SELECT COUNT(*)::integer AS count
      FROM products
      WHERE ups_batch = 22 AND is_deleted = true
    `))[0].count).toBe(8);
    expect((await rows<{ drop_number: string; is_deleted: boolean }>(`
      SELECT drop_number, is_deleted FROM drops ORDER BY drop_number
    `))).toEqual([
      { drop_number: '0', is_deleted: true },
      { drop_number: '22', is_deleted: true },
      { drop_number: '23', is_deleted: false },
    ]);

    await expect(rows(`
      INSERT INTO products (id, name, drop_number, ups_batch)
      VALUES ('blocked-product-26', 'Bloqueado', '26', 26)
    `)).rejects.toThrow('inventory_ups_not_allowed:26');
    await expect(rows(`
      UPDATE products SET is_deleted = false WHERE id = 'cleanup-product-22'
    `)).rejects.toThrow('inventory_ups_not_allowed:22');
  });

  it('enforces role, optimistic locking and audit atomically', async () => {
    const version = await seedSale({
      id: 'integration-role-lock', total: 100, cash: 100,
      items: [{ productId: 'integration-product-a', quantity: 1, unitPrice: 100 }],
    });
    const payload = editPayload({
      transactionId: 'integration-role-lock', expectedUpdatedAt: version, total: 90, cash: 90,
      items: [{ productId: 'integration-product-a', quantity: 1, unitPrice: 90 }],
    });

    await asUser(VIEWER_ID);
    await expect(callRpc(payload)).rejects.toThrow('insufficient_role');

    await db.exec('SET ROLE authenticated;');
    await asUser(ADMIN_ID);
    const result = await callRpc(payload).finally(async () => {
      await db.exec('RESET ROLE;');
      await asUser(ADMIN_ID);
    });
    expect(result.newTotal).toBe(90);
    await expect(callRpc(payload)).rejects.toThrow('sale_modified_concurrently');
    expect((await rows<{ count: number }>(
      `SELECT COUNT(*)::integer AS count FROM sale_edit_audit WHERE transaction_id = 'integration-role-lock'`,
    ))[0].count).toBe(1);
  });

  it('keeps cent allocation exact and rolls inventory back after a stock failure', async () => {
    const version = await seedSale({
      id: 'integration-cents-stock', total: 30, cash: 30, discount: 7.77,
      items: [
        { productId: 'integration-product-a', quantity: 1, unitPrice: 10 },
        { productId: 'integration-product-b', quantity: 2, unitPrice: 10 },
      ],
    });
    const before = (await rows<{ available_qty: number; sold_qty: number }>(
      `SELECT available_qty, sold_qty FROM products WHERE id = 'integration-product-b'`,
    ))[0];
    const result = await callRpc(editPayload({
      transactionId: 'integration-cents-stock', expectedUpdatedAt: version, total: 1000.03, cash: 1000.03,
      items: [
        { productId: 'integration-product-a', quantity: 1, unitPrice: 10 },
        { productId: 'integration-product-b', quantity: 5, unitPrice: 10 },
      ],
    }));
    const after = (await rows<{ available_qty: number; sold_qty: number }>(
      `SELECT available_qty, sold_qty FROM products WHERE id = 'integration-product-b'`,
    ))[0];
    expect(after.available_qty).toBe(before.available_qty - 3);
    expect(after.sold_qty).toBe(before.sold_qty + 3);

    const totals = (await rows<{ line_sum: string; subtotal: string }>(`
      SELECT SUM(item.total_price)::text AS line_sum, transaction.subtotal::text AS subtotal
      FROM transactions transaction
      JOIN transaction_items item ON item.transaction_id = transaction.id
      WHERE transaction.id = 'integration-cents-stock'
      GROUP BY transaction.subtotal
    `))[0];
    expect(totals.line_sum).toBe(totals.subtotal);

    const stockBeforeFailure = after.available_qty;
    await expect(callRpc(editPayload({
      transactionId: 'integration-cents-stock', expectedUpdatedAt: String(result.updatedAt),
      total: 99990, cash: 99990,
      items: [
        { productId: 'integration-product-a', quantity: 1, unitPrice: 10 },
        { productId: 'integration-product-b', quantity: 9999, unitPrice: 10 },
      ],
    }))).rejects.toThrow('insufficient_stock');
    expect((await rows<{ available_qty: number }>(
      `SELECT available_qty FROM products WHERE id = 'integration-product-b'`,
    ))[0].available_qty).toBe(stockBeforeFailure);
  });

  it('allocates by quantity when every submitted line weight is zero', async () => {
    const version = await seedSale({
      id: 'integration-zero-weights', total: 0,
      items: [
        { productId: 'integration-product-a', quantity: 1, unitPrice: 0 },
        { productId: 'integration-product-b', quantity: 2, unitPrice: 0 },
      ],
    });

    await callRpc(editPayload({
      transactionId: 'integration-zero-weights', expectedUpdatedAt: version, total: 10, cash: 10,
      items: [
        { productId: 'integration-product-a', quantity: 1, unitPrice: 0 },
        { productId: 'integration-product-b', quantity: 2, unitPrice: 0 },
      ],
    }));

    const allocated = await rows<{ total_price: string; unit_price: string }>(`
      SELECT total_price::text, unit_price::text
      FROM transaction_items
      WHERE transaction_id = 'integration-zero-weights'
      ORDER BY line_no
    `);
    expect(allocated).toEqual([
      { total_price: '3.33', unit_price: '3.330000' },
      { total_price: '6.67', unit_price: '3.335000' },
    ]);
  });

  it('does not carry an installment payment into a future sale', async () => {
    await db.exec(`INSERT INTO customers (id, name, balance, total_purchases) VALUES ('integration-customer-orphan', 'Cliente', 300, 300);`);
    await seedInstallment('integration-payment-orphan', 'integration-customer-orphan', 500, '2025-01-01T00:00:00Z');
    const version = await seedSale({
      id: 'integration-sale-after-payment', customerId: 'integration-customer-orphan', total: 300,
      date: '2026-01-01T00:00:00Z',
      items: [{ productId: 'integration-product-c', quantity: 3, unitPrice: 100 }],
    });

    const result = await callRpc(editPayload({
      transactionId: 'integration-sale-after-payment', expectedUpdatedAt: version, total: 300, cash: 100,
      date: '2026-01-01T00:00:00Z',
      items: [{ productId: 'integration-product-c', quantity: 3, unitPrice: 100 }],
    }));
    expect(result.installmentApplied).toBe(0);
  });

  it('allows method corrections but protects historical payment and applied installments', async () => {
    await db.exec(`INSERT INTO customers (id, name, balance, total_purchases) VALUES ('integration-customer-guard', 'Cliente', 300, 1000);`);
    const version = await seedSale({
      id: 'integration-sale-guard', customerId: 'integration-customer-guard', total: 1000, cash: 100,
      date: '2026-03-01T00:00:00Z',
      items: [{ productId: 'integration-product-c', quantity: 10, unitPrice: 100 }],
    });
    await seedInstallment('integration-payment-guard', 'integration-customer-guard', 600, '2026-03-02T00:00:00Z');

    const corrected = await callRpc(editPayload({
      transactionId: 'integration-sale-guard', expectedUpdatedAt: version, total: 1000, transfer: 100,
      date: '2026-03-01T00:00:00Z',
      items: [{ productId: 'integration-product-c', quantity: 10, unitPrice: 100 }],
    }));
    expect(corrected.installmentApplied).toBe(600);
    expect(corrected.effectiveRemainingBalance).toBe(300);

    const adjustedTotal = await callRpc(editPayload({
      transactionId: 'integration-sale-guard', expectedUpdatedAt: String(corrected.updatedAt), total: 900, transfer: 100,
      date: '2026-03-01T00:00:00Z',
      items: [{ productId: 'integration-product-c', quantity: 10, unitPrice: 90 }],
    }));
    expect(adjustedTotal.installmentApplied).toBe(600);
    expect(adjustedTotal.effectiveRemainingBalance).toBe(200);
    expect(Number((await rows<{ balance: string }>(
      `SELECT balance::text AS balance FROM customers WHERE id = 'integration-customer-guard'`,
    ))[0].balance)).toBe(200);

    await expect(callRpc(editPayload({
      transactionId: 'integration-sale-guard', expectedUpdatedAt: String(adjustedTotal.updatedAt), total: 900, transfer: 50,
      date: '2026-03-01T00:00:00Z',
      items: [{ productId: 'integration-product-c', quantity: 10, unitPrice: 90 }],
    }))).rejects.toThrow('sale_payment_locked_by_installments');
  });

  it('prevents a direct stale update from rewinding the optimistic-lock version', async () => {
    const firstVersion = await seedSale({
      id: 'integration-version-trigger', total: 100, cash: 100,
      items: [{ productId: 'integration-product-a', quantity: 1, unitPrice: 100 }],
    });
    const edited = await callRpc(editPayload({
      transactionId: 'integration-version-trigger', expectedUpdatedAt: firstVersion, total: 90, cash: 90,
      items: [{ productId: 'integration-product-a', quantity: 1, unitPrice: 90 }],
    }));

    await rows(
      `UPDATE transactions SET notes = 'stale client', updated_at = $1 WHERE id = 'integration-version-trigger'`,
      [firstVersion],
    );
    const currentVersion = (await rows<{ updated_at: string }>(
      `SELECT updated_at FROM transactions WHERE id = 'integration-version-trigger'`,
    ))[0].updated_at;
    expect(new Date(currentVersion).getTime()).toBeGreaterThanOrEqual(new Date(String(edited.updatedAt)).getTime());

    await expect(callRpc(editPayload({
      transactionId: 'integration-version-trigger', expectedUpdatedAt: firstVersion, total: 80, cash: 80,
      items: [{ productId: 'integration-product-a', quantity: 1, unitPrice: 80 }],
    }))).rejects.toThrow('sale_modified_concurrently');
  });

  it('edits and reduces a sale with a deleted product without reactivating it', async () => {
    await db.exec(`
      INSERT INTO products (
        id, name, drop_number, ups_batch, available_qty, sold_qty
      ) VALUES ('integration-deleted-product', 'Producto histórico', '23', 23, 8, 2);
    `);
    const version = await seedSale({
      id: 'integration-deleted-sale', total: 200, cash: 200,
      items: [{ productId: 'integration-deleted-product', quantity: 2, unitPrice: 100 }],
    });
    await db.exec(`
      UPDATE products
      SET is_deleted = true, deleted_at = NOW()
      WHERE id = 'integration-deleted-product';
    `);

    const notesEdit = await callRpc(editPayload({
      transactionId: 'integration-deleted-sale', expectedUpdatedAt: version,
      total: 200, cash: 200, notes: 'Comentario actualizado',
      items: [{ productId: 'integration-deleted-product', quantity: 2, unitPrice: 100 }],
    }));

    await expect(callRpc(editPayload({
      transactionId: 'integration-deleted-sale', expectedUpdatedAt: String(notesEdit.updatedAt),
      total: 300, cash: 300,
      items: [{ productId: 'integration-deleted-product', quantity: 3, unitPrice: 100 }],
    }))).rejects.toThrow('insufficient_stock');

    const reduced = await callRpc(editPayload({
      transactionId: 'integration-deleted-sale', expectedUpdatedAt: String(notesEdit.updatedAt),
      total: 100, cash: 100,
      items: [{ productId: 'integration-deleted-product', quantity: 1, unitPrice: 100 }],
    }));

    expect(reduced.inventoryChanged).toBe(true);
    expect((await rows<{ is_deleted: boolean; available_qty: number; sold_qty: number }>(`
      SELECT is_deleted, available_qty, sold_qty
      FROM products WHERE id = 'integration-deleted-product'
    `))[0]).toEqual({ is_deleted: true, available_qty: 9, sold_qty: 1 });
  });

  it('refunds and undoes historical sales while old products stay deleted', async () => {
    await db.exec(`
      INSERT INTO products (
        id, name, quantity, drop_number, ups_batch, available_qty, sold_qty
      ) VALUES
        ('integration-modify-deleted', 'Producto edición anterior', 1, '25', 25, 0, 1),
        ('integration-refund-deleted', 'Producto devolución', 1, '23', 23, 0, 1),
        ('integration-undo-deleted', 'Producto deshacer', 2, '24', 24, 0, 2);
      UPDATE products
      SET is_deleted = true, deleted_at = NOW()
      WHERE id IN (
        'integration-modify-deleted',
        'integration-refund-deleted',
        'integration-undo-deleted'
      );
    `);

    await rows(`
      SELECT public.modify_sale_transaction_inventory_base_v024(
        '{"productId":"integration-modify-deleted","qtyDelta":-1}'::jsonb
      )
    `);
    expect((await rows<{ is_deleted: boolean; available_qty: number; sold_qty: number }>(`
      SELECT is_deleted, available_qty, sold_qty
      FROM products WHERE id = 'integration-modify-deleted'
    `))[0]).toEqual({ is_deleted: true, available_qty: 1, sold_qty: 0 });

    await rows(`
      SELECT public.refund_sale_transaction_from_edit_inventory_base_v024(
        '{"productId":"integration-refund-deleted","quantity":1}'::jsonb
      )
    `);
    expect((await rows<{ is_deleted: boolean; available_qty: number; sold_qty: number }>(`
      SELECT is_deleted, available_qty, sold_qty
      FROM products WHERE id = 'integration-refund-deleted'
    `))[0]).toEqual({ is_deleted: true, available_qty: 1, sold_qty: 0 });

    await seedSale({
      id: 'integration-undo-sale', total: 200, cash: 200,
      items: [{ productId: 'integration-undo-deleted', quantity: 2, unitPrice: 100 }],
    });
    await rows(`
      SELECT public.undo_sale_transaction(
        '{"transactionId":"integration-undo-sale","reason":"Prueba"}'::jsonb
      )
    `);
    expect((await rows<{ is_deleted: boolean; available_qty: number; sold_qty: number }>(`
      SELECT is_deleted, available_qty, sold_qty
      FROM products WHERE id = 'integration-undo-deleted'
    `))[0]).toEqual({ is_deleted: true, available_qty: 2, sold_qty: 0 });
  });
});
