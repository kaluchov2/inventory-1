import { afterEach, describe, expect, it, vi } from 'vitest';
import { TransactionItem } from '../types';
import { createSaleTransaction } from './transactionHelpers';

const item: TransactionItem = {
  productId: 'product-1',
  productName: 'Camisa',
  quantity: 2,
  unitPrice: 150,
  totalPrice: 300,
  category: 'DAM',
};

describe('createSaleTransaction', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('calculates subtotal, discount and total', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-03T10:00:00.000Z'));

    const transaction = createSaleTransaction(
      { id: 'customer-1', name: 'Cliente' },
      [item],
      { method: 'cash', cash: 250, transfer: 0, card: 0 },
      { discount: 50, discountNote: 'Promo' },
    );

    expect(transaction).toMatchObject({
      customerId: 'customer-1',
      customerName: 'Cliente',
      subtotal: 300,
      discount: 50,
      discountNote: 'Promo',
      total: 250,
      paymentMethod: 'cash',
      cashAmount: 250,
      type: 'sale',
      date: '2026-02-03T10:00:00.000Z',
    });
  });

  it('supports mixed payments and installment flag', () => {
    const transaction = createSaleTransaction(
      { name: 'Cliente de Paso' },
      [item],
      { method: 'mixed', cash: 100, transfer: 100, card: 50 },
      { isInstallment: true },
    );

    expect(transaction.customerId).toBeUndefined();
    expect(transaction.paymentMethod).toBe('mixed');
    expect(transaction.cashAmount).toBe(100);
    expect(transaction.transferAmount).toBe(100);
    expect(transaction.cardAmount).toBe(50);
    expect(transaction.isInstallment).toBe(true);
  });
});
