import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const migration = (name: string) => readFileSync(
  new URL(`../../supabase/migrations/${name}`, import.meta.url),
  'utf8',
);

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
}) {
  return {
    transactionId: options.transactionId,
    expectedUpdatedAt: options.expectedUpdatedAt,
    date: options.date ?? '2026-05-01T10:00:00Z',
    total: options.total,
    cashAmount: options.cash ?? 0,
    transferAmount: options.transfer ?? 0,
    cardAmount: options.card ?? 0,
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
      id text PRIMARY KEY, name text, unit_price numeric DEFAULT 0,
      available_qty integer DEFAULT 0, sold_qty integer DEFAULT 0, donated_qty integer DEFAULT 0,
      lost_qty integer DEFAULT 0, expired_qty integer DEFAULT 0, status text DEFAULT 'available',
      sold_to text, sold_at timestamptz, updated_at timestamptz DEFAULT NOW(), is_deleted boolean DEFAULT false
    );
    CREATE TABLE sat_keys (id text PRIMARY KEY, code text, description text, is_deleted boolean DEFAULT false);
    CREATE TABLE transactions (
      id text PRIMARY KEY, customer_id text, customer_name text,
      subtotal numeric, discount numeric DEFAULT 0, discount_note text, total numeric,
      payment_method text, cash_amount numeric DEFAULT 0, transfer_amount numeric DEFAULT 0,
      card_amount numeric DEFAULT 0, actual_card_amount numeric, is_installment boolean DEFAULT false,
      installment_amount numeric, remaining_balance numeric, ups_batch text, notes text,
      date timestamptz, payment_date timestamptz, type text, sold_by text,
      created_at timestamptz DEFAULT NOW(), is_deleted boolean DEFAULT false
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
  await db.exec(`
    GRANT USAGE ON SCHEMA public, auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
    ALTER TABLE sale_edit_audit FORCE ROW LEVEL SECURITY;

    INSERT INTO profiles (id, role) VALUES ('${ADMIN_ID}', 'admin'), ('${VIEWER_ID}', 'viewer');
    INSERT INTO products (id, name, available_qty, sold_qty) VALUES
      ('integration-product-a', 'Producto A', 100, 0),
      ('integration-product-b', 'Producto B', 100, 0),
      ('integration-product-c', 'Producto C', 100, 0);
  `);
  await asUser(ADMIN_ID);
}, 30_000);

afterAll(async () => {
  await db?.close();
});

describe.sequential('edit_sale_transaction_details PostgreSQL integration', () => {
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
});
