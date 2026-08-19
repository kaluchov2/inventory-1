import { describe, expect, it } from 'vitest';
import { allocateSaleSubtotal, getEffectiveSalePendingMap, hasInventoryMovement, rescalePaymentAmounts } from './saleEditPricing';
import { Transaction } from '../types';

const item = (productId: string, quantity: number, unitPrice: number) => ({
  productId,
  productName: productId,
  quantity,
  unitPrice,
  totalPrice: quantity * unitPrice,
});

describe('allocateSaleSubtotal', () => {
  it('distributes the direct total proportionally and leaves no cent residue', () => {
    const result = allocateSaleSubtotal([item('a', 1, 10), item('b', 1, 20)], 10, 0);
    expect(result.map((line) => line.totalPrice)).toEqual([3.33, 6.67]);
    expect(result.reduce((sum, line) => sum + line.totalPrice, 0)).toBe(10);
  });

  it('keeps the historical discount in the allocated subtotal', () => {
    const result = allocateSaleSubtotal([item('a', 2, 25)], 40, 10);
    expect(result[0]).toMatchObject({ unitPrice: 25, totalPrice: 50 });
  });

  it('uses quantities when every source price is zero', () => {
    const result = allocateSaleSubtotal([item('a', 1, 0), item('b', 2, 0)], 1, 0);
    expect(result.map((line) => line.totalPrice)).toEqual([0.33, 0.67]);
  });

  it('uses the explicit source line total as the single allocation weight', () => {
    const first = { ...item('a', 1, 10), totalPrice: 90 };
    const second = { ...item('b', 1, 90), totalPrice: 10 };
    const result = allocateSaleSubtotal([first, second], 100, 0);
    expect(result.map((line) => line.totalPrice)).toEqual([90, 10]);
  });

  it('never makes the residue line negative in a large sale', () => {
    const manyItems = Array.from({ length: 102 }, (_, index) => item(String(index), 1, index === 101 ? 4.05 : 0.95));
    const result = allocateSaleSubtotal(manyItems, 1, 0);
    expect(result.every((line) => line.totalPrice >= 0)).toBe(true);
    expect(result.reduce((sum, line) => sum + line.totalPrice, 0)).toBeCloseTo(1, 10);
  });
});

describe('hasInventoryMovement', () => {
  it('ignores administrative and price-only edits', () => {
    expect(hasInventoryMovement([item('a', 1, 10)], [item('a', 1, 50)])).toBe(false);
  });

  it('detects aggregate quantity and product changes', () => {
    expect(hasInventoryMovement([item('a', 1, 10)], [item('a', 2, 10)])).toBe(true);
    expect(hasInventoryMovement([item('a', 1, 10)], [item('b', 1, 10)])).toBe(true);
  });
});

describe('rescalePaymentAmounts', () => {
  it('keeps the rounding residue on the largest existing method', () => {
    expect(rescalePaymentAmounts({ cash: 50, transfer: 50, card: 0 }, 100.01)).toEqual({
      cash: 50.01,
      transfer: 50,
      card: 0,
    });
  });

  it('never invents a payment method or returns a negative amount', () => {
    const result = rescalePaymentAmounts({ cash: 12.34, transfer: 0, card: 87.66 }, 0.01);
    expect(result.transfer).toBe(0);
    expect(result.cash).toBeGreaterThanOrEqual(0);
    expect(result.card).toBeGreaterThanOrEqual(0);
    expect(result.cash + result.card).toBeCloseTo(0.01, 10);
  });

  it('uses cash as the explicit fallback when no original method exists', () => {
    expect(rescalePaymentAmounts({ cash: 0, transfer: 0, card: 0 }, 25)).toEqual({
      cash: 25,
      transfer: 0,
      card: 0,
    });
  });
});

describe('getEffectiveSalePendingMap', () => {
  const transaction = (values: Partial<Transaction> & Pick<Transaction, 'id' | 'type' | 'total'>): Transaction => {
    const defaults: Transaction = {
      id: values.id,
      customerId: 'customer-1',
      customerName: 'Cliente',
      items: [],
      subtotal: values.total,
      discount: 0,
      total: values.total,
      paymentMethod: 'credit',
      cashAmount: 0,
      transferAmount: 0,
      cardAmount: 0,
      isInstallment: values.type === 'installment_payment',
      date: '2026-08-17T12:00:00.000Z',
      type: values.type,
      createdAt: '2026-08-17T12:00:00.000Z',
    };
    return { ...defaults, ...values };
  };

  it('keeps installment payments separate and allocates them FIFO by date and id', () => {
    const pending = getEffectiveSalePendingMap([
      transaction({ id: 'sale-b', type: 'sale', total: 500 }),
      transaction({ id: 'sale-a', type: 'sale', total: 1000 }),
      transaction({ id: 'payment-1', type: 'installment_payment', total: 1200 }),
    ], 'customer-1');

    expect(pending.get('sale-a')).toBe(0);
    expect(pending.get('sale-b')).toBe(300);
  });

  it('does not carry an orphan payment into a future sale', () => {
    const pending = getEffectiveSalePendingMap([
      transaction({ id: 'payment-before', type: 'installment_payment', total: 500, date: '2025-01-01T12:00:00.000Z' }),
      transaction({ id: 'sale-after', type: 'sale', total: 300, date: '2026-01-01T12:00:00.000Z' }),
    ], 'customer-1');

    expect(pending.get('sale-after')).toBe(300);
  });

  it('uses later payments after earlier debt was already settled', () => {
    const pending = getEffectiveSalePendingMap([
      transaction({ id: 'sale-old', type: 'sale', total: 100, date: '2026-01-01T12:00:00.000Z' }),
      transaction({ id: 'payment-old', type: 'installment_payment', total: 100, date: '2026-01-02T12:00:00.000Z' }),
      transaction({ id: 'sale-target', type: 'sale', total: 300, date: '2026-02-01T12:00:00.000Z' }),
      transaction({ id: 'payment-new', type: 'installment_payment', total: 50, date: '2026-02-02T12:00:00.000Z' }),
    ], 'customer-1');

    expect(pending.get('sale-old')).toBe(0);
    expect(pending.get('sale-target')).toBe(250);
  });
});
