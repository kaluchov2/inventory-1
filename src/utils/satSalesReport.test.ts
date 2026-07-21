import { describe, expect, it } from 'vitest';
import { Transaction } from '../types';
import { buildMonthlySatSalesRows, getPaymentMethodLabel } from './satSalesReport';

const transaction: Transaction = {
  id: 'tx-1',
  customerName: 'Cliente',
  items: [
    {
      productId: 'product-with-sat',
      productName: 'Camisa',
      quantity: 1,
      unitPrice: 200,
      totalPrice: 200,
      satKeyId: 'sat-ropa-old',
      satKeyCode: '02002',
      satKeyDescription: 'Ropa',
    },
    {
      productId: 'product-without-sat',
      productName: 'Pantalon',
      quantity: 1,
      unitPrice: 150,
      totalPrice: 150,
    },
    {
      productId: '',
      productName: 'Producto mostrador',
      quantity: 1,
      unitPrice: 50,
      totalPrice: 50,
    },
  ],
  subtotal: 400,
  discount: 0,
  total: 400,
  paymentMethod: 'transfer',
  cashAmount: 0,
  transferAmount: 400,
  cardAmount: 0,
  isInstallment: false,
  date: '2026-03-15T12:00:00.000Z',
  type: 'sale',
  createdAt: '2026-03-15T12:00:00.000Z',
};

describe('buildMonthlySatSalesRows', () => {
  it('uses the SAT snapshot saved on the sale item', () => {
    const rows = buildMonthlySatSalesRows([transaction], '2026-03');

    expect(rows[0]).toMatchObject({
      description: 'Camisa',
      satCode: '02002',
      satDescription: 'Ropa',
      satStatus: 'Con clave',
      paymentMethod: 'Transferencia',
    });
  });

  it('marks sale items without a SAT snapshot', () => {
    const rows = buildMonthlySatSalesRows([transaction], '2026-03');

    expect(rows).toHaveLength(3);
    expect(rows[1]).toMatchObject({
      description: 'Pantalon',
      satCode: 'Sin clave SAT',
      satStatus: 'Sin clave SAT',
    });
    expect(rows[2]).toMatchObject({
      description: 'Producto mostrador',
      satCode: 'Sin clave SAT',
      satStatus: 'Sin clave SAT',
    });
  });

  it('filters by month and ignores returns', () => {
    const rows = buildMonthlySatSalesRows(
      [
        transaction,
        { ...transaction, id: 'tx-2', date: '2026-04-01T00:00:00.000Z' },
        { ...transaction, id: 'tx-3', type: 'return' },
      ],
      '2026-03',
    );

    expect(rows).toHaveLength(3);
  });
});

describe('getPaymentMethodLabel', () => {
  it('formats every payment method used by reports', () => {
    expect(getPaymentMethodLabel('cash')).toBe('Efectivo');
    expect(getPaymentMethodLabel('transfer')).toBe('Transferencia');
    expect(getPaymentMethodLabel('card')).toBe('Tarjeta');
    expect(getPaymentMethodLabel('mixed')).toBe('Mixto');
    expect(getPaymentMethodLabel('credit')).toBe('Crédito');
  });
});
